require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const http = require('http');

// --- MINI SERVER PENTRU RAILWAY ---
http.createServer((req, res) => {
    res.write("EUGVRP Bot is online!");
    res.end();
}).listen(process.env.PORT || 3000);

// --- CONFIGURARE IDs ---
const ROLES = {
    SESSION_HOST: '1392137660117549056',
    POLITIE: '1392135802053722222',
    POMPIERI: '1392137836412665948',
    DOT: '1392138933336543252',
    EARLY_ACCESS: '1456269750605709372' // Rolul adăugat nou
};

const CHANNELS = {
    SESIUNE: '1391712465364193323',
    TURE: '1391845254298210304',
    LOGS: '1391846238454026341'
};

// --- BAZE DE DATE IN-MEMORY ---
const sessionData = { active: false, host: null, link: null, startTime: null, shiftsCount: 0, activeMembers: new Set() };
const activeShifts = new Map(); 
const userStats = new Map(); 
const sessionVotes = new Set(); // Stocăm ID-urile celor care au votat DA la sesiune

// --- INITIALIZARE CLIENT ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// --- HELPER FUNCTIONS ---
function msToTime(duration) {
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    return `${hours}h ${minutes}m`;
}

async function sendLog(guild, embed) {
    const logChannel = guild.channels.cache.get(CHANNELS.LOGS);
    if (logChannel) await logChannel.send({ embeds: [embed] });
}

// --- DEFINIRE COMENZI SLASH ---
const commands = [
    // Sesiune
    new SlashCommandBuilder().setName('sesiune_start').setDescription('Pornește o sesiune RP. (Doar Session Host)')
        .addStringOption(opt => opt.setName('link').setDescription('Link către serverul privat Roblox').setRequired(true)),
    new SlashCommandBuilder().setName('sesiune_stop').setDescription('Oprește sesiunea curentă RP.'),
    new SlashCommandBuilder().setName('sesiune_status').setDescription('Vezi statusul sesiunii curente.'),
    new SlashCommandBuilder().setName('sesiune_vote').setDescription('Anunță pregătirea unei sesiuni și strânge voturi. (Doar Session Host)'),
    
    // Ture
    new SlashCommandBuilder().setName('tura_start').setDescription('Începe tura în departamentul tău.'),
    new SlashCommandBuilder().setName('tura_stop').setDescription('Oprește tura și salvează progresul.'),
    new SlashCommandBuilder().setName('tura_status').setDescription('Vezi statusul turei tale.'),
    
    // RP & Utilitare
    new SlashCommandBuilder().setName('radio').setDescription('Transmite un mesaj pe stație (Necesită tură activă)')
        .addStringOption(opt => opt.setName('mesaj').setDescription('Mesajul de transmis pe stație').setRequired(true)),
    new SlashCommandBuilder().setName('112').setDescription('Apelează dispeceratul 112')
        .addStringOption(opt => opt.setName('locatie').setDescription('Locația incidentului').setRequired(true))
        .addStringOption(opt => opt.setName('mesaj').setDescription('Motivul apelului').setRequired(true)),
    new SlashCommandBuilder().setName('panic').setDescription('Apasă butonul de panică! (Doar Poliție)'),
    new SlashCommandBuilder().setName('stats').setDescription('Vezi statisticile tale de roleplay.'),
    new SlashCommandBuilder().setName('top_ture').setDescription('Vezi topul membrilor cu cele mai multe ore.'),
    new SlashCommandBuilder().setName('apply').setDescription('Aplică pentru un departament')
        .addStringOption(opt => opt.setName('departament')
            .setDescription('Alege departamentul').setRequired(true)
            .addChoices({name: 'Poliție', value: 'Poliție'}, {name: 'Pompieri', value: 'Pompieri'}, {name: 'DOT', value: 'DOT'}))
        .addStringOption(opt => opt.setName('motiv').setDescription('De ce vrei să aplici?').setRequired(true)),
    new SlashCommandBuilder().setName('ticket').setDescription('Deschide un tichet de asistență.'),
    
    // Admin
    new SlashCommandBuilder().setName('admin_stop_tura').setDescription('Oprește forțat tura cuiva.')
        .addUserOption(opt => opt.setName('utilizator').setDescription('Utilizatorul').setRequired(true)),
    new SlashCommandBuilder().setName('admin_stop_sesiune').setDescription('Oprește forțat sesiunea.'),
    new SlashCommandBuilder().setName('admin_reset_stats').setDescription('Resetează statisticile unui jucător.')
        .addUserOption(opt => opt.setName('utilizator').setDescription('Utilizatorul').setRequired(true))
];

// --- EVENIMENTE DISCORD ---
client.on('ready', async () => {
    console.log(`[BOT] Conectat cu succes ca ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('Se încarcă comenzile (/) ...');
        // Aici poți pune Route per-Guild dacă vrei să se încarce instantaneu
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comenzile au fost încărcate!');
    } catch (error) {
        console.error(error);
    }
});

// INTERCEPTEAZĂ BUTOANELE
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const { customId, member } = interaction;

        // BUTON: Obține Link Sesiune (Doar roluri permise)
        if (customId === 'get_server_link') {
            if (!sessionData.active) {
                return interaction.reply({ content: 'Nu există nicio sesiune activă momentan!', ephemeral: true });
            }

            // Verificare Roluri
            const allowedRoles = [ROLES.SESSION_HOST, ROLES.POLITIE, ROLES.POMPIERI, ROLES.DOT, ROLES.EARLY_ACCESS];
            const hasAccess = allowedRoles.some(role => member.roles.cache.has(role));

            if (hasAccess) {
                // Dacă are acces, îi trimitem link-ul ca buton de browser (URL) doar pentru el
                const linkRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Intră pe Serverul Roblox')
                        .setStyle(ButtonStyle.Link)
                        .setURL(sessionData.link)
                );
                return interaction.reply({ content: '✅ Ai acces! Apasă pe butonul de mai jos pentru a deschide jocul.', components: [linkRow], ephemeral: true });
            } else {
                return interaction.reply({ content: '❌ Acces respins! Deocamdată, doar membrii cu **Early Access** sau din **Facțiuni (Poliție, Pompieri, DOT)** pot obține link-ul.', ephemeral: true });
            }
        }

        // BUTON: Votare Sesiune (Vot DA)
        if (customId === 'vote_yes') {
            if (sessionVotes.has(interaction.user.id)) {
                return interaction.reply({ content: 'Ai votat deja că participi!', ephemeral: true });
            }
            sessionVotes.add(interaction.user.id); // Îl adăugăm în lista de votanți

            // Actualizăm numărul de voturi direct pe mesajul embed (în timp real)
            const msg = interaction.message;
            const embed = EmbedBuilder.from(msg.embeds[0]);
            embed.data.fields[0].value = `${sessionVotes.size} membri`; // Update field-ul cu voturi

            await msg.edit({ embeds: [embed] });
            return interaction.reply({ content: '✅ Votul tău a fost înregistrat cu succes!', ephemeral: true });
        }

        // BUTON: Vezi Votanți (Doar Session Host)
        if (customId === 'view_voters') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST)) {
                return interaction.reply({ content: '❌ Doar un Session Host poate vedea lista de votanți.', ephemeral: true });
            }

            if (sessionVotes.size === 0) {
                return interaction.reply({ content: 'Nimeni nu a votat momentan.', ephemeral: true });
            }

            // Generăm o listă cu toți cei care au votat (mentionându-i)
            const votersList = Array.from(sessionVotes).map(id => `<@${id}>`).join('\n');
            return interaction.reply({ content: `**📋 Jucători care au votat că participă (${sessionVotes.size}):**\n${votersList}`, ephemeral: true });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, member, guild } = interaction;

    try {
        // =============== SISTEM SESIUNE ===============
        
        // COMANDĂ NOUĂ: /sesiune_vote
        if (commandName === 'sesiune_vote') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST)) {
                return interaction.reply({ content: 'Nu ai permisiunea de a folosi această comandă.', ephemeral: true });
            }

            sessionVotes.clear(); // Resetăm voturile de la sesiunea anterioară

            const embed = new EmbedBuilder()
                .setTitle('📊 SE PREGĂTEȘTE O SESIUNE DE ROLEPLAY!')
                .setDescription(`Salutare <@&1392137660117549056> (sau oricine e interesat),\n\n${user} pregătește o sesiune.\n**Vă rugăm să votați mai jos** dacă puteți participa pentru a ști dacă suntem suficienți jucători!`)
                .setColor('Orange')
                .addFields({ name: '✋ Voturi DA', value: '0 membri', inline: true })
                .setThumbnail('https://i.imgur.com/zV8Q8Hq.png') // Aici poți pune un logo
                .setFooter({ text: 'EUGVRP România' }).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('vote_yes').setLabel('Voi participa!').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('view_voters').setLabel('Vezi Votanți (Staff)').setStyle(ButtonStyle.Secondary).setEmoji('📋')
            );

            return interaction.reply({ content: '@here', embeds: [embed], components: [row] });
        }

        // START SESIUNE
        if (commandName === 'sesiune_start') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST)) {
                return interaction.reply({ content: 'Nu ai permisiunea de a folosi această comandă.', ephemeral: true });
            }
            if (sessionData.active) {
                return interaction.reply({ content: 'Există deja o sesiune activă!', ephemeral: true });
            }

            sessionData.active = true;
            sessionData.host = user;
            sessionData.link = interaction.options.getString('link'); // Linkul îl salvăm, dar NU îl punem direct în embed public
            sessionData.startTime = Date.now();
            sessionData.shiftsCount = 0;
            sessionData.activeMembers.clear();

            const embed = new EmbedBuilder()
                .setTitle('🟢 SESIUNE ROLEPLAY ACTIVĂ')
                .setColor('Green')
                .addFields(
                    { name: 'Host Sesiune', value: `${user}`, inline: true },
                    { name: 'Status', value: 'ACTIV', inline: true },
                    { name: 'Ora Start', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
                    { name: 'Membri în Tură', value: '0', inline: true }
                )
                .setDescription('Pentru a intra pe server, apasă butonul de mai jos. (Necesită Early Access sau rol de Facțiune).')
                .setFooter({ text: 'EUGVRP România' }).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('get_server_link')
                    .setLabel('Obține Link Server')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔗')
            );

            const channel = guild.channels.cache.get(CHANNELS.SESIUNE);
            if (channel) await channel.send({ content: `<@&${ROLES.SESSION_HOST}> Sesiunea a început!`, embeds: [embed], components: [row] });

            await sendLog(guild, new EmbedBuilder().setColor('Green').setTitle('Sesiune Pornită').setDescription(`Sesiune pornită de ${user}`));
            return interaction.reply({ content: 'Sesiunea a fost pornită cu succes!', ephemeral: true });
        }

        if (commandName === 'sesiune_stop' || commandName === 'admin_stop_sesiune') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Nu ai permisiunea!', ephemeral: true });
            }
            if (!sessionData.active) return interaction.reply({ content: 'Nu există nicio sesiune activă.', ephemeral: true });

            const durationMs = Date.now() - sessionData.startTime;
            
            // Oprește toate turele active forțat
            activeShifts.forEach((val, key) => {
                if(userStats.has(key)) {
                    let st = userStats.get(key);
                    st.totalTime += (Date.now() - val.startTime);
                    userStats.set(key, st);
                }
            });
            activeShifts.clear();
            sessionData.active = false;
            sessionData.link = null; // Ștergem linkul din memorie pentru siguranță

            const embed = new EmbedBuilder()
                .setTitle('🔴 SESIUNE ROLEPLAY OPRITĂ')
                .setColor('Red')
                .addFields(
                    { name: 'Durată Totală', value: msToTime(durationMs), inline: true },
                    { name: 'Total Ture Efectuate', value: `${sessionData.shiftsCount}`, inline: true },
                    { name: 'Membri Unici Activi', value: `${sessionData.activeMembers.size}`, inline: true }
                )
                .setFooter({ text: 'EUGVRP România' }).setTimestamp();

            const channel = guild.channels.cache.get(CHANNELS.SESIUNE);
            if (channel) await channel.send({ embeds: [embed] });

            await sendLog(guild, new EmbedBuilder().setColor('Red').setTitle('Sesiune Oprită').setDescription(`Sesiune oprită de ${user}. Durată: ${msToTime(durationMs)}`));
            return interaction.reply({ content: 'Sesiunea a fost oprită, iar raportul a fost trimis!', ephemeral: true });
        }

        if (commandName === 'sesiune_status') {
            if (!sessionData.active) return interaction.reply({ content: 'Nu există nicio sesiune activă.', ephemeral: true });
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('Blue').setTitle('Status Sesiune').addFields(
                    { name: 'Host', value: `${sessionData.host}`, inline: true },
                    { name: 'Timp Scurs', value: msToTime(Date.now() - sessionData.startTime), inline: true },
                    { name: 'Membri în tură', value: `${activeShifts.size}`, inline: true }
                )]
            });
        }

        // =============== SISTEM TURE ===============
        if (commandName === 'tura_start') {
            if (!sessionData.active) return interaction.reply({ content: 'Nu poți începe tura pentru că nu există nicio sesiune activă.', ephemeral: true });
            if (activeShifts.has(user.id)) return interaction.reply({ content: 'Ești deja în tură!', ephemeral: true });

            let dept = null;
            let color = 'Grey';
            
            if (member.roles.cache.has(ROLES.POLITIE)) { dept = 'Poliție'; color = 'Blue'; }
            else if (member.roles.cache.has(ROLES.POMPIERI)) { dept = 'Pompieri'; color = 'Red'; }
            else if (member.roles.cache.has(ROLES.DOT)) { dept = 'DOT'; color = 'Yellow'; }

            if (!dept) {
                return interaction.reply({ content: 'Numele tău nu are rolul necesar pentru a începe această tură. Dacă vrei să faci parte din această facțiune, te rugăm să aplici pentru ea.', ephemeral: true });
            }

            activeShifts.set(user.id, { dept, startTime: Date.now() });
            sessionData.activeMembers.add(user.id);
            sessionData.shiftsCount++;

            if (!userStats.has(user.id)) userStats.set(user.id, { shifts: 0, totalTime: 0, dept: dept });

            const embed = new EmbedBuilder().setTitle('✅ TURĂ ÎNCEPUTĂ').setColor(color)
                .addFields(
                    { name: 'Ofițer', value: `${user}`, inline: true },
                    { name: 'Departament', value: dept, inline: true },
                    { name: 'Ora', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true }
                ).setTimestamp();

            const tChannel = guild.channels.cache.get(CHANNELS.TURE);
            if (tChannel) await tChannel.send({ embeds: [embed] });

            await sendLog(guild, new EmbedBuilder().setColor('Green').setTitle('Tură Pornită').setDescription(`${user} a început tura ca ${dept}`));
            return interaction.reply({ content: 'Ai intrat în tură cu succes!', ephemeral: true });
        }

        if (commandName === 'tura_stop' || commandName === 'admin_stop_tura') {
            const targetUser = interaction.options.getUser('utilizator') || user;
            
            if (commandName === 'admin_stop_tura' && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Nu ai permisiuni de admin.', ephemeral: true });
            }

            if (!activeShifts.has(targetUser.id)) return interaction.reply({ content: `${targetUser} nu este în tură.`, ephemeral: true });

            const shiftData = activeShifts.get(targetUser.id);
            const durationMs = Date.now() - shiftData.startTime;
            
            activeShifts.delete(targetUser.id);

            let stats = userStats.get(targetUser.id);
            stats.shifts += 1;
            stats.totalTime += durationMs;
            userStats.set(targetUser.id, stats);

            const embed = new EmbedBuilder().setTitle('🛑 TURĂ OPRITĂ').setColor('DarkButNotBlack')
                .addFields(
                    { name: 'Utilizator', value: `${targetUser}`, inline: true },
                    { name: 'Departament', value: shiftData.dept, inline: true },
                    { name: 'Durată Tură', value: msToTime(durationMs), inline: true }
                ).setTimestamp();

            const tChannel = guild.channels.cache.get(CHANNELS.TURE);
            if (tChannel) await tChannel.send({ embeds: [embed] });

            await sendLog(guild, new EmbedBuilder().setColor('Red').setTitle('Tură Oprită').setDescription(`${targetUser} a oprit tura. Durată: ${msToTime(durationMs)}`));
            return interaction.reply({ content: 'Tura a fost oprită cu succes!', ephemeral: true });
        }

        if (commandName === 'tura_status') {
            if (!activeShifts.has(user.id)) return interaction.reply({ content: 'Nu ești în tură momentan.', ephemeral: true });
            const data = activeShifts.get(user.id);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('Green').setTitle('Status Tură').addFields(
                    { name: 'Departament', value: data.dept, inline: true },
                    { name: 'Timp Scurs', value: msToTime(Date.now() - data.startTime), inline: true }
                )]
            });
        }

        // =============== SISTEME RP (RADIO, 112, PANIC) ===============
        if (commandName === 'radio') {
            if (!activeShifts.has(user.id)) return interaction.reply({ content: 'Trebuie să fii într-o tură activă pentru a folosi stația radio!', ephemeral: true });
            const mesaj = interaction.options.getString('mesaj');
            const data = activeShifts.get(user.id);

            const embed = new EmbedBuilder().setTitle('📻 TRANSMISIE RADIO').setColor('NotQuiteBlack')
                .addFields(
                    { name: 'Ofițer', value: `${user} [${data.dept}]` },
                    { name: 'Mesaj', value: `"${mesaj}"` }
                ).setTimestamp();

            await sendLog(guild, embed);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === '112') {
            const mesaj = interaction.options.getString('mesaj');
            const locatie = interaction.options.getString('locatie');

            const embed = new EmbedBuilder().setTitle('🚨 112 DISPATCH').setColor('DarkRed')
                .addFields(
                    { name: 'Apelant', value: `${user}`, inline: true },
                    { name: '📍 Locație', value: locatie, inline: true },
                    { name: '📞 Mesaj / Incident', value: mesaj, inline: false }
                ).setTimestamp();

            await sendLog(guild, embed);
            return interaction.reply({ content: `<@&${ROLES.POLITIE}> <@&${ROLES.POMPIERI}> Apel 112 în așteptare!`, embeds: [embed] });
        }

        if (commandName === 'panic') {
            if (!member.roles.cache.has(ROLES.POLITIE)) return interaction.reply({ content: 'Doar membrii Poliției pot folosi butonul de panică!', ephemeral: true });
            
            const embed = new EmbedBuilder().setTitle('🚨 OFIȚER ÎN PERICOL (PANIC BUTTON)').setColor('Red')
                .setDescription(`**ATENȚIE TOATE UNITĂȚILE!**\nOFIȚERUL ${user} A APĂSAT BUTONUL DE PANICĂ! PREZENȚA IMEDIATĂ ESTE NECESARĂ.`)
                .setTimestamp();
            
            await sendLog(guild, embed);
            return interaction.reply({ content: `@here URGENT!`, embeds: [embed] });
        }

        // =============== STATISTICI & UTILS ===============
        if (commandName === 'stats') {
            if (!userStats.has(user.id)) return interaction.reply({ content: 'Nu ai statistici înregistrate încă.', ephemeral: true });
            const stats = userStats.get(user.id);
            const embed = new EmbedBuilder().setTitle(`📊 Statistici: ${user.username}`).setColor('Blurple')
                .addFields(
                    { name: 'Departament Principal', value: stats.dept, inline: true },
                    { name: 'Ture Efectuate', value: `${stats.shifts}`, inline: true },
                    { name: 'Timp Total în Tură', value: msToTime(stats.totalTime), inline: true }
                ).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'top_ture') {
            const sortedStats = Array.from(userStats.entries()).sort((a, b) => b[1].totalTime - a[1].totalTime).slice(0, 10);
            
            if (sortedStats.length === 0) return interaction.reply({ content: 'Nu există date pentru top încă.', ephemeral: true });

            const embed = new EmbedBuilder().setTitle('🏆 TOP 10 MEMBRI (ORE ROLEPLAY)').setColor('Gold');
            let description = '';
            
            sortedStats.forEach(([id, data], index) => {
                description += `**${index + 1}.** <@${id}> - **${msToTime(data.totalTime)}** (${data.shifts} ture) [${data.dept}]\n`;
            });

            embed.setDescription(description).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'apply') {
            const dept = interaction.options.getString('departament');
            const motiv = interaction.options.getString('motiv');

            const embed = new EmbedBuilder().setTitle(`📝 APLICAȚIE NOUĂ: ${dept}`).setColor('Green')
                .addFields(
                    { name: 'Aplicant', value: `${user} (${user.id})` },
                    { name: 'Motiv', value: motiv }
                ).setTimestamp();
            
            await sendLog(guild, embed);
            return interaction.reply({ content: 'Aplicația ta a fost trimisă cu succes la staff!', ephemeral: true });
        }

        if (commandName === 'ticket') {
            const channel = await guild.channels.create({
                name: `ticket-${user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });
            const embed = new EmbedBuilder().setTitle('🎫 Tichet de Suport').setDescription(`${user}, un membru staff te va prelua imediat.`).setColor('Blue');
            await channel.send({ embeds: [embed] });
            return interaction.reply({ content: `Tichetul tău a fost creat: ${channel}`, ephemeral: true });
        }

        if (commandName === 'admin_reset_stats') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'Nu ai permisiuni.', ephemeral: true });
            const targetUser = interaction.options.getUser('utilizator');
            userStats.delete(targetUser.id);
            return interaction.reply({ content: `Statisticile pentru ${targetUser} au fost resetate.`, ephemeral: true });
        }

    } catch (error) {
        console.error('Eroare la comanda:', error);
        if(!interaction.replied) {
            await interaction.reply({ content: 'A apărut o eroare la procesarea comenzii.', ephemeral: true }).catch(console.error);
        }
    }
});

client.login(process.env.TOKEN);
