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
    EARLY_ACCESS: '1456269750605709372' // Rolul adÄƒugat nou
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
const sessionVotes = new Set(); // StocÄƒm ID-urile celor care au votat DA la sesiune

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
    new SlashCommandBuilder().setName('sesiune_start').setDescription('PorneÈ™te o sesiune RP. (Doar Session Host)')
        .addStringOption(opt => opt.setName('link').setDescription('Link cÄƒtre serverul privat Roblox').setRequired(true)),
    new SlashCommandBuilder().setName('sesiune_stop').setDescription('OpreÈ™te sesiunea curentÄƒ RP.'),
    new SlashCommandBuilder().setName('sesiune_status').setDescription('Vezi statusul sesiunii curente.'),
    new SlashCommandBuilder().setName('sesiune_vote').setDescription('AnunÈ›Äƒ pregÄƒtirea unei sesiuni È™i strÃ¢nge voturi. (Doar Session Host)'),
    
    // Ture
    new SlashCommandBuilder().setName('tura_start').setDescription('ÃŽncepe tura Ã®n departamentul tÄƒu.'),
    new SlashCommandBuilder().setName('tura_stop').setDescription('OpreÈ™te tura È™i salveazÄƒ progresul.'),
    new SlashCommandBuilder().setName('tura_status').setDescription('Vezi statusul turei tale.'),
    
    // RP & Utilitare
    new SlashCommandBuilder().setName('radio').setDescription('Transmite un mesaj pe staÈ›ie (NecesitÄƒ turÄƒ activÄƒ)')
        .addStringOption(opt => opt.setName('mesaj').setDescription('Mesajul de transmis pe staÈ›ie').setRequired(true)),
    new SlashCommandBuilder().setName('112').setDescription('ApeleazÄƒ dispeceratul 112')
        .addStringOption(opt => opt.setName('locatie').setDescription('LocaÈ›ia incidentului').setRequired(true))
        .addStringOption(opt => opt.setName('mesaj').setDescription('Motivul apelului').setRequired(true)),
    new SlashCommandBuilder().setName('panic').setDescription('ApasÄƒ butonul de panicÄƒ! (Doar PoliÈ›ie)'),
    new SlashCommandBuilder().setName('stats').setDescription('Vezi statisticile tale de roleplay.'),
    new SlashCommandBuilder().setName('top_ture').setDescription('Vezi topul membrilor cu cele mai multe ore.'),
    new SlashCommandBuilder().setName('apply').setDescription('AplicÄƒ pentru un departament')
        .addStringOption(opt => opt.setName('departament')
            .setDescription('Alege departamentul').setRequired(true)
            .addChoices({name: 'PoliÈ›ie', value: 'PoliÈ›ie'}, {name: 'Pompieri', value: 'Pompieri'}, {name: 'DOT', value: 'DOT'}))
        .addStringOption(opt => opt.setName('motiv').setDescription('De ce vrei sÄƒ aplici?').setRequired(true)),
    new SlashCommandBuilder().setName('ticket').setDescription('Deschide un tichet de asistenÈ›Äƒ.'),
    
    // Admin
    new SlashCommandBuilder().setName('admin_stop_tura').setDescription('OpreÈ™te forÈ›at tura cuiva.')
        .addUserOption(opt => opt.setName('utilizator').setDescription('Utilizatorul').setRequired(true)),
    new SlashCommandBuilder().setName('admin_stop_sesiune').setDescription('OpreÈ™te forÈ›at sesiunea.'),
    new SlashCommandBuilder().setName('admin_reset_stats').setDescription('ReseteazÄƒ statisticile unui jucÄƒtor.')
        .addUserOption(opt => opt.setName('utilizator').setDescription('Utilizatorul').setRequired(true))
];

// --- EVENIMENTE DISCORD ---
client.on('ready', async () => {
    console.log(`[BOT] Conectat cu succes ca ${client.user.tag}!`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('Se Ã®ncarcÄƒ comenzile (/) ...');
        // Aici poÈ›i pune Route per-Guild dacÄƒ vrei sÄƒ se Ã®ncarce instantaneu
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Comenzile au fost Ã®ncÄƒrcate!');
    } catch (error) {
        console.error(error);
    }
});

// INTERCEPTEAZÄ‚ BUTOANELE
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const { customId, member } = interaction;

        // BUTON: ObÈ›ine Link Sesiune (Doar roluri permise)
        if (customId === 'get_server_link') {
            if (!sessionData.active) {
                return interaction.reply({ content: 'Nu existÄƒ nicio sesiune activÄƒ momentan!', ephemeral: true });
            }

            // Verificare Roluri
            const allowedRoles = [ROLES.SESSION_HOST, ROLES.POLITIE, ROLES.POMPIERI, ROLES.DOT, ROLES.EARLY_ACCESS];
            const hasAccess = allowedRoles.some(role => member.roles.cache.has(role));

            if (hasAccess) {
                // DacÄƒ are acces, Ã®i trimitem link-ul ca buton de browser (URL) doar pentru el
                const linkRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('IntrÄƒ pe Serverul Roblox')
                        .setStyle(ButtonStyle.Link)
                        .setURL(sessionData.link)
                );
                return interaction.reply({ content: 'âœ… Ai acces! ApasÄƒ pe butonul de mai jos pentru a deschide jocul.', components: [linkRow], ephemeral: true });
            } else {
                return interaction.reply({ content: 'âŒ Acces respins! DeocamdatÄƒ, doar membrii cu **Early Access** sau din **FacÈ›iuni (PoliÈ›ie, Pompieri, DOT)** pot obÈ›ine link-ul.', ephemeral: true });
            }
        }

        // BUTON: Votare Sesiune (Vot DA)
        if (customId === 'vote_yes') {
            if (sessionVotes.has(interaction.user.id)) {
                return interaction.reply({ content: 'Ai votat deja cÄƒ participi!', ephemeral: true });
            }
            sessionVotes.add(interaction.user.id); // ÃŽl adÄƒugÄƒm Ã®n lista de votanÈ›i

            // ActualizÄƒm numÄƒrul de voturi direct pe mesajul embed (Ã®n timp real)
            const msg = interaction.message;
            const embed = EmbedBuilder.from(msg.embeds[0]);
            embed.data.fields[0].value = `${sessionVotes.size} membri`; // Update field-ul cu voturi

            await msg.edit({ embeds: [embed] });
            return interaction.reply({ content: 'âœ… Votul tÄƒu a fost Ã®nregistrat cu succes!', ephemeral: true });
        }

        // BUTON: Vezi VotanÈ›i (Doar Session Host)
        if (customId === 'view_voters') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST)) {
                return interaction.reply({ content: 'âŒ Doar un Session Host poate vedea lista de votanÈ›i.', ephemeral: true });
            }

            if (sessionVotes.size === 0) {
                return interaction.reply({ content: 'Nimeni nu a votat momentan.', ephemeral: true });
            }

            // GenerÄƒm o listÄƒ cu toÈ›i cei care au votat (mentionÃ¢ndu-i)
            const votersList = Array.from(sessionVotes).map(id => `<@${id}>`).join('\n');
            return interaction.reply({ content: `**ðŸ“‹ JucÄƒtori care au votat cÄƒ participÄƒ (${sessionVotes.size}):**\n${votersList}`, ephemeral: true });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, user, member, guild } = interaction;

    try {
        // =============== SISTEM SESIUNE ===============
        
        // COMANDÄ‚ NOUÄ‚: /sesiune_vote
        if (commandName === 'sesiune_vote') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST)) {
                return interaction.reply({ content: 'Nu ai permisiunea de a folosi aceastÄƒ comandÄƒ.', ephemeral: true });
            }

            sessionVotes.clear(); // ResetÄƒm voturile de la sesiunea anterioarÄƒ

            const embed = new EmbedBuilder()
                .setTitle('ðŸ“Š SE PREGÄ‚TEÈ˜TE O SESIUNE DE ROLEPLAY!')
                .setDescription(`Salutare <@&1392137660117549056> (sau oricine e interesat),\n\n${user} pregÄƒteÈ™te o sesiune.\n**VÄƒ rugÄƒm sÄƒ votaÈ›i mai jos** dacÄƒ puteÈ›i participa pentru a È™ti dacÄƒ suntem suficienÈ›i jucÄƒtori!`)
                .setColor('Orange')
                .addFields({ name: 'âœ‹ Voturi DA', value: '0 membri', inline: true })
                .setThumbnail('https://i.imgur.com/zV8Q8Hq.png') // Aici poÈ›i pune un logo
                .setFooter({ text: 'EUGVRP RomÃ¢nia' }).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('vote_yes').setLabel('Voi participa!').setStyle(ButtonStyle.Success).setEmoji('âœ…'),
                new ButtonBuilder().setCustomId('view_voters').setLabel('Vezi VotanÈ›i (Staff)').setStyle(ButtonStyle.Secondary).setEmoji('ðŸ“‹')
            );

            return interaction.reply({ content: '@here', embeds: [embed], components: [row] });
        }

        // START SESIUNE
        if (commandName === 'sesiune_start') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST)) {
                return interaction.reply({ content: 'Nu ai permisiunea de a folosi aceastÄƒ comandÄƒ.', ephemeral: true });
            }
            if (sessionData.active) {
                return interaction.reply({ content: 'ExistÄƒ deja o sesiune activÄƒ!', ephemeral: true });
            }

            sessionData.active = true;
            sessionData.host = user;
            sessionData.link = interaction.options.getString('link'); // Linkul Ã®l salvÄƒm, dar NU Ã®l punem direct Ã®n embed public
            sessionData.startTime = Date.now();
            sessionData.shiftsCount = 0;
            sessionData.activeMembers.clear();

            const embed = new EmbedBuilder()
                .setTitle('ðŸŸ¢ SESIUNE ROLEPLAY ACTIVÄ‚')
                .setColor('Green')
                .addFields(
                    { name: 'Host Sesiune', value: `${user}`, inline: true },
                    { name: 'Status', value: 'ACTIV', inline: true },
                    { name: 'Ora Start', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true },
                    { name: 'Membri Ã®n TurÄƒ', value: '0', inline: true }
                )
                .setDescription('Pentru a intra pe server, apasÄƒ butonul de mai jos. (NecesitÄƒ Early Access sau rol de FacÈ›iune).')
                .setFooter({ text: 'EUGVRP RomÃ¢nia' }).setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('get_server_link')
                    .setLabel('ObÈ›ine Link Server')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('ðŸ”—')
            );

            const channel = guild.channels.cache.get(CHANNELS.SESIUNE);
            if (channel) await channel.send({ content: `<@&${ROLES.SESSION_HOST}> Sesiunea a Ã®nceput!`, embeds: [embed], components: [row] });

            await sendLog(guild, new EmbedBuilder().setColor('Green').setTitle('Sesiune PornitÄƒ').setDescription(`Sesiune pornitÄƒ de ${user}`));
            return interaction.reply({ content: 'Sesiunea a fost pornitÄƒ cu succes!', ephemeral: true });
        }

        if (commandName === 'sesiune_stop' || commandName === 'admin_stop_sesiune') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Nu ai permisiunea!', ephemeral: true });
            }
            if (!sessionData.active) return interaction.reply({ content: 'Nu existÄƒ nicio sesiune activÄƒ.', ephemeral: true });

            const durationMs = Date.now() - sessionData.startTime;
            
            // OpreÈ™te toate turele active forÈ›at
            activeShifts.forEach((val, key) => {
                if(userStats.has(key)) {
                    let st = userStats.get(key);
                    st.totalTime += (Date.now() - val.startTime);
                    userStats.set(key, st);
                }
            });
            activeShifts.clear();
            sessionData.active = false;
            sessionData.link = null; // È˜tergem linkul din memorie pentru siguranÈ›Äƒ

            const embed = new EmbedBuilder()
                .setTitle('ðŸ”´ SESIUNE ROLEPLAY OPRITÄ‚')
                .setColor('Red')
                .addFields(
                    { name: 'DuratÄƒ TotalÄƒ', value: msToTime(durationMs), inline: true },
                    { name: 'Total Ture Efectuate', value: `${sessionData.shiftsCount}`, inline: true },
                    { name: 'Membri Unici Activi', value: `${sessionData.activeMembers.size}`, inline: true }
                )
                .setFooter({ text: 'EUGVRP RomÃ¢nia' }).setTimestamp();

            const channel = guild.channels.cache.get(CHANNELS.SESIUNE);
            if (channel) await channel.send({ embeds: [embed] });

            await sendLog(guild, new EmbedBuilder().setColor('Red').setTitle('Sesiune OpritÄƒ').setDescription(`Sesiune opritÄƒ de ${user}. DuratÄƒ: ${msToTime(durationMs)}`));
            return interaction.reply({ content: 'Sesiunea a fost opritÄƒ, iar raportul a fost trimis!', ephemeral: true });
        }

        if (commandName === 'sesiune_status') {
            if (!sessionData.active) return interaction.reply({ content: 'Nu existÄƒ nicio sesiune activÄƒ.', ephemeral: true });
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('Blue').setTitle('Status Sesiune').addFields(
                    { name: 'Host', value: `${sessionData.host}`, inline: true },
                    { name: 'Timp Scurs', value: msToTime(Date.now() - sessionData.startTime), inline: true },
                    { name: 'Membri Ã®n turÄƒ', value: `${activeShifts.size}`, inline: true }
                )]
            });
        }

        // =============== SISTEM TURE ===============
        if (commandName === 'tura_start') {
            if (!sessionData.active) return interaction.reply({ content: 'Nu poÈ›i Ã®ncepe tura pentru cÄƒ nu existÄƒ nicio sesiune activÄƒ.', ephemeral: true });
            if (activeShifts.has(user.id)) return interaction.reply({ content: 'EÈ™ti deja Ã®n turÄƒ!', ephemeral: true });

            let dept = null;
            let color = 'Grey';
            
            if (member.roles.cache.has(ROLES.POLITIE)) { dept = 'PoliÈ›ie'; color = 'Blue'; }
            else if (member.roles.cache.has(ROLES.POMPIERI)) { dept = 'Pompieri'; color = 'Red'; }
            else if (member.roles.cache.has(ROLES.DOT)) { dept = 'DOT'; color = 'Yellow'; }

            if (!dept) {
                return interaction.reply({ content: 'Numele tÄƒu nu are rolul necesar pentru a Ã®ncepe aceastÄƒ turÄƒ. DacÄƒ vrei sÄƒ faci parte din aceastÄƒ facÈ›iune, te rugÄƒm sÄƒ aplici pentru ea.', ephemeral: true });
            }

            activeShifts.set(user.id, { dept, startTime: Date.now() });
            sessionData.activeMembers.add(user.id);
            sessionData.shiftsCount++;

            if (!userStats.has(user.id)) userStats.set(user.id, { shifts: 0, totalTime: 0, dept: dept });

            const embed = new EmbedBuilder().setTitle('âœ… TURÄ‚ ÃŽNCEPUTÄ‚').setColor(color)
                .addFields(
                    { name: 'OfiÈ›er', value: `${user}`, inline: true },
                    { name: 'Departament', value: dept, inline: true },
                    { name: 'Ora', value: `<t:${Math.floor(Date.now() / 1000)}:T>`, inline: true }
                ).setTimestamp();

            const tChannel = guild.channels.cache.get(CHANNELS.TURE);
            if (tChannel) await tChannel.send({ embeds: [embed] });

            await sendLog(guild, new EmbedBuilder().setColor('Green').setTitle('TurÄƒ PornitÄƒ').setDescription(`${user} a Ã®nceput tura ca ${dept}`));
            return interaction.reply({ content: 'Ai intrat Ã®n turÄƒ cu succes!', ephemeral: true });
        }

        if (commandName === 'tura_stop' || commandName === 'admin_stop_tura') {
            const targetUser = interaction.options.getUser('utilizator') || user;
            
            if (commandName === 'admin_stop_tura' && !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: 'Nu ai permisiuni de admin.', ephemeral: true });
            }

            if (!activeShifts.has(targetUser.id)) return interaction.reply({ content: `${targetUser} nu este Ã®n turÄƒ.`, ephemeral: true });

            const shiftData = activeShifts.get(targetUser.id);
            const durationMs = Date.now() - shiftData.startTime;
            
            activeShifts.delete(targetUser.id);

            let stats = userStats.get(targetUser.id);
            stats.shifts += 1;
            stats.totalTime += durationMs;
            userStats.set(targetUser.id, stats);

            const embed = new EmbedBuilder().setTitle('ðŸ›‘ TURÄ‚ OPRITÄ‚').setColor('DarkButNotBlack')
                .addFields(
                    { name: 'Utilizator', value: `${targetUser}`, inline: true },
                    { name: 'Departament', value: shiftData.dept, inline: true },
                    { name: 'DuratÄƒ TurÄƒ', value: msToTime(durationMs), inline: true }
                ).setTimestamp();

            const tChannel = guild.channels.cache.get(CHANNELS.TURE);
            if (tChannel) await tChannel.send({ embeds: [embed] });

            await sendLog(guild, new EmbedBuilder().setColor('Red').setTitle('TurÄƒ OpritÄƒ').setDescription(`${targetUser} a oprit tura. DuratÄƒ: ${msToTime(durationMs)}`));
            return interaction.reply({ content: 'Tura a fost opritÄƒ cu succes!', ephemeral: true });
        }

        if (commandName === 'tura_status') {
            if (!activeShifts.has(user.id)) return interaction.reply({ content: 'Nu eÈ™ti Ã®n turÄƒ momentan.', ephemeral: true });
            const data = activeShifts.get(user.id);
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('Green').setTitle('Status TurÄƒ').addFields(
                    { name: 'Departament', value: data.dept, inline: true },
                    { name: 'Timp Scurs', value: msToTime(Date.now() - data.startTime), inline: true }
                )]
            });
        }

        // =============== SISTEME RP (RADIO, 112, PANIC) ===============
        if (commandName === 'radio') {
            if (!activeShifts.has(user.id)) return interaction.reply({ content: 'Trebuie sÄƒ fii Ã®ntr-o turÄƒ activÄƒ pentru a folosi staÈ›ia radio!', ephemeral: true });
            const mesaj = interaction.options.getString('mesaj');
            const data = activeShifts.get(user.id);

            const embed = new EmbedBuilder().setTitle('ðŸ“» TRANSMISIE RADIO').setColor('NotQuiteBlack')
                .addFields(
                    { name: 'OfiÈ›er', value: `${user} [${data.dept}]` },
                    { name: 'Mesaj', value: `"${mesaj}"` }
                ).setTimestamp();

            await sendLog(guild, embed);
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === '112') {
            const mesaj = interaction.options.getString('mesaj');
            const locatie = interaction.options.getString('locatie');

            const embed = new EmbedBuilder().setTitle('ðŸš¨ 112 DISPATCH').setColor('DarkRed')
                .addFields(
                    { name: 'Apelant', value: `${user}`, inline: true },
                    { name: 'ðŸ“ LocaÈ›ie', value: locatie, inline: true },
                    { name: 'ðŸ“ž Mesaj / Incident', value: mesaj, inline: false }
                ).setTimestamp();

            await sendLog(guild, embed);
            return interaction.reply({ content: `<@&${ROLES.POLITIE}> <@&${ROLES.POMPIERI}> Apel 112 Ã®n aÈ™teptare!`, embeds: [embed] });
        }

        if (commandName === 'panic') {
            if (!member.roles.cache.has(ROLES.POLITIE)) return interaction.reply({ content: 'Doar membrii PoliÈ›iei pot folosi butonul de panicÄƒ!', ephemeral: true });
            
            const embed = new EmbedBuilder().setTitle('ðŸš¨ OFIÈšER ÃŽN PERICOL (PANIC BUTTON)').setColor('Red')
                .setDescription(`**ATENÈšIE TOATE UNITÄ‚ÈšILE!**\nOFIÈšERUL ${user} A APÄ‚SAT BUTONUL DE PANICÄ‚! PREZENÈšA IMEDIATÄ‚ ESTE NECESARÄ‚.`)
                .setTimestamp();
            
            await sendLog(guild, embed);
            return interaction.reply({ content: `@here URGENT!`, embeds: [embed] });
        }

        // =============== STATISTICI & UTILS ===============
        if (commandName === 'stats') {
            if (!userStats.has(user.id)) return interaction.reply({ content: 'Nu ai statistici Ã®nregistrate Ã®ncÄƒ.', ephemeral: true });
            const stats = userStats.get(user.id);
            const embed = new EmbedBuilder().setTitle(`ðŸ“Š Statistici: ${user.username}`).setColor('Blurple')
                .addFields(
                    { name: 'Departament Principal', value: stats.dept, inline: true },
                    { name: 'Ture Efectuate', value: `${stats.shifts}`, inline: true },
                    { name: 'Timp Total Ã®n TurÄƒ', value: msToTime(stats.totalTime), inline: true }
                ).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'top_ture') {
            const sortedStats = Array.from(userStats.entries()).sort((a, b) => b[1].totalTime - a[1].totalTime).slice(0, 10);
            
            if (sortedStats.length === 0) return interaction.reply({ content: 'Nu existÄƒ date pentru top Ã®ncÄƒ.', ephemeral: true });

            const embed = new EmbedBuilder().setTitle('ðŸ† TOP 10 MEMBRI (ORE ROLEPLAY)').setColor('Gold');
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

            const embed = new EmbedBuilder().setTitle(`ðŸ“ APLICAÈšIE NOUÄ‚: ${dept}`).setColor('Green')
                .addFields(
                    { name: 'Aplicant', value: `${user} (${user.id})` },
                    { name: 'Motiv', value: motiv }
                ).setTimestamp();
            
            await sendLog(guild, embed);
            return interaction.reply({ content: 'AplicaÈ›ia ta a fost trimisÄƒ cu succes la staff!', ephemeral: true });
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
            const embed = new EmbedBuilder().setTitle('ðŸŽ« Tichet de Suport').setDescription(`${user}, un membru staff te va prelua imediat.`).setColor('Blue');
            await channel.send({ embeds: [embed] });
            return interaction.reply({ content: `Tichetul tÄƒu a fost creat: ${channel}`, ephemeral: true });
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
            await interaction.reply({ content: 'A apÄƒrut o eroare la procesarea comenzii.', ephemeral: true }).catch(console.error);
        }
    }
});

client.login(process.env.TOKEN);
