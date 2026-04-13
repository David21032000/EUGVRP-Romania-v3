const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURARE
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
    roles: {
        sessionHost: process.env.ROLE_SESSION_HOST || '1392137660117549056',
        politie: process.env.ROLE_POLITIE || '1392135802053722222',
        pompieri: process.env.ROLE_POMPIERI || '1392137836412665948',
        dot: process.env.ROLE_DOT || '1392138933336543252',
        cetateni: process.env.ROLE_CETATENI || '1392137321846935712',
        earlyAccess: process.env.ROLE_EARLY_ACCESS || '1456269750605709372'
    },
    channels: {
        sesiune: process.env.CHANNEL_SESIUNE || '1391712465364193323',
        ture: process.env.CHANNEL_TURE || '1391845254298210304',
        loguri: process.env.CHANNEL_LOGURI || '1391846238454026341'
    },
    colors: {
        politie: 0x3498db,
        pompieri: 0xe74c3c,
        dot: 0xf1c40f,
        session: 0x2ecc71,
        error: 0xff0000,
        warning: 0xff9900,
        success: 0x00ff00,
        radio: 0x9b59b6,
        emergency: 0xff0000,
        panic: 0xff0000,
        ticket: 0x0099ff,
        apply: 0x9933ff,
        vote: 0x5865F2
    },
    departments: {
        politie: 'Poliție',
        pompieri: 'Pompieri',
        dot: 'DOT'
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STOCARE DATE ÎN MEMORIE
// ═══════════════════════════════════════════════════════════════════════════════

const sessionsMap = new Map();
const shiftsMap = new Map();
const statsMap = new Map();
const votesMap = new Map();
const applicationsMap = new Map();
const ticketsMap = new Map();

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT DISCORD
// ═══════════════════════════════════════════════════════════════════════════════

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCȚII HELPER
// ═══════════════════════════════════════════════════════════════════════════════

function hasRole(member, roleId) {
    return member.roles.cache.has(roleId);
}

function hasAnyRole(member, roleIds) {
    return roleIds.some(roleId => member.roles.cache.has(roleId));
}

function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function getDepartmentFromRoles(member) {
    if (hasRole(member, CONFIG.roles.politie)) return 'politie';
    if (hasRole(member, CONFIG.roles.pompieri)) return 'pompieri';
    if (hasRole(member, CONFIG.roles.dot)) return 'dot';
    return null;
}

function getDepartmentColor(department) {
    return CONFIG.colors[department] || CONFIG.colors.session;
}

function getDepartmentName(department) {
    return CONFIG.departments[department] || 'Necunoscut';
}

function getDepartmentEmoji(department) {
    const emojis = {
        politie: '🚔',
        pompieri: '🚒',
        dot: '🛠️'
    };
    return emojis[department] || '👤';
}

function normalizeLink(rawLink) {
    if (typeof rawLink !== 'string') return rawLink;
    if (/^(https?:\/\/|roblox:\/\/)/i.test(rawLink)) {
        return rawLink;
    }
    return `https://${rawLink}`;
}

async function sendLog(guild, embed) {
    const logChannel = guild.channels.cache.get(CONFIG.channels.loguri);
    if (logChannel) {
        await logChannel.send({ embeds: [embed] });
    }
}

function initializeUserStats(userId) {
    if (!statsMap.has(userId)) {
        statsMap.set(userId, {
            totalShifts: 0,
            totalMinutes: 0,
            department: null
        });
    }
    return statsMap.get(userId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMENZI SLASH
// ═══════════════════════════════════════════════════════════════════════════════

const commands = [
    // SISTEM SESIUNE
    new SlashCommandBuilder()
        .setName('sesiune_start')
        .setDescription('🎮 Pornește o sesiune roleplay pe server')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('Link-ul serverului Roblox privat')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('locatie')
                .setDescription('Locația sesiunii')
                .setRequired(true)
                .addChoices(
                    { name: '🗺️ RoadMap', value: 'RoadMap' },
                    { name: '🏘️ BrookeMere', value: 'BrookeMere' },
                    { name: '🌆 Horton', value: 'Horton' },
                    { name: '🏞️ Ron Rivers', value: 'Ron Rivers' }
                ))
        .addIntegerOption(option =>
            option.setName('frp')
                .setDescription('Viteza maximă FRP (km/h)')
                .setRequired(true)
                .setMinValue(50)
                .setMaxValue(300)),

    new SlashCommandBuilder()
        .setName('sesiune_stop')
        .setDescription('🛑 Oprește sesiunea roleplay activă'),

    new SlashCommandBuilder()
        .setName('sesiune_status')
        .setDescription('📊 Vezi statusul sesiunii curente'),

    new SlashCommandBuilder()
        .setName('sesiune_vote')
        .setDescription('🗳️ Pornește un vot pentru sesiune roleplay'),

    // SISTEM TURE
    new SlashCommandBuilder()
        .setName('tura_start')
        .setDescription('🚔 Începe tura ta în departament'),

    new SlashCommandBuilder()
        .setName('tura_stop')
        .setDescription('🏁 Oprește tura ta activă'),

    new SlashCommandBuilder()
        .setName('tura_status')
        .setDescription('📋 Vezi statusul turei tale curente'),

    // SISTEM RADIO
    new SlashCommandBuilder()
        .setName('radio')
        .setDescription('📡 Trimite un mesaj pe frecvența radio')
        .addStringOption(option =>
            option.setName('mesaj')
                .setDescription('Mesajul de transmis pe radio')
                .setRequired(true)),

    // SISTEM DISPECERAT 112
    new SlashCommandBuilder()
        .setName('112')
        .setDescription('🚨 Apelează dispeceratul de urgență')
        .addStringOption(option =>
            option.setName('locație')
                .setDescription('Locația incidentului')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mesaj')
                .setDescription('Detaliile incidentului')
                .setRequired(true)),

    // PANIC BUTTON
    new SlashCommandBuilder()
        .setName('panic')
        .setDescription('🚨🚨🚨 BUTON PANICĂ - OFIȚER ÎN PERICOL'),

    // STATISTICI
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 Vezi statisticile tale sau ale altui jucător')
        .addUserOption(option =>
            option.setName('utilizator')
                .setDescription('Utilizatorul pentru care vrei statistici')
                .setRequired(false)),

    // LEADERBOARD
    new SlashCommandBuilder()
        .setName('top_ture')
        .setDescription('🏆 Vezi top 10 membri cu cele mai multe ore'),

    // APLICAȚII
    new SlashCommandBuilder()
        .setName('apply')
        .setDescription('📝 Depune o aplicație pentru un departament')
        .addStringOption(option =>
            option.setName('departament')
                .setDescription('Departamentul pentru care aplici')
                .setRequired(true)
                .addChoices(
                    { name: '🚔 Poliție', value: 'politie' },
                    { name: '🚒 Pompieri', value: 'pompieri' },
                    { name: '🛠️ DOT', value: 'dot' }
                )),

    // TICKETS
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('🎫 Creează un ticket de suport')
        .addStringOption(option =>
            option.setName('motiv')
                .setDescription('Motivul pentru care deschizi ticket-ul')
                .setRequired(true)),

    // RELOAD COMENZI (Server Owner only)
    new SlashCommandBuilder()
        .setName('reload')
        .setDescription('🔄 Reîncarcă comenzile botului (Owner only)')
];

// ═══════════════════════════════════════════════════════════════════════════════
// EVENIMENTE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

client.once('clientReady', async () => {
    console.log(`✅ ${client.user.tag} este conectat!`);
    console.log(`🎮 Bot pregătit pentru EUGVRP România!`);

    // Înregistrare comenzi slash
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
            await guild.commands.set(commands);
            console.log('✅ Comenzile slash au fost înregistrate!');
        } else {
            console.log('⚠️ Nu s-a găsit serverul. Comenzile nu au fost înregistrate.');
        }
    } catch (error) {
        console.error('❌ Eroare la înregistrarea comenzilor:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        await handleCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButton(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER COMENZI
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCommand(interaction) {
    const { commandName } = interaction;

    switch (commandName) {
        case 'sesiune_start':
            await handleSesiuneStart(interaction);
            break;
        case 'sesiune_stop':
            await handleSesiuneStop(interaction);
            break;
        case 'sesiune_status':
            await handleSesiuneStatus(interaction);
            break;
        case 'sesiune_vote':
            await handleSesiuneVote(interaction);
            break;
        case 'tura_start':
            await handleTuraStart(interaction);
            break;
        case 'tura_stop':
            await handleTuraStop(interaction);
            break;
        case 'tura_status':
            await handleTuraStatus(interaction);
            break;
        case 'radio':
            await handleRadio(interaction);
            break;
        case '112':
            await handle112(interaction);
            break;
        case 'panic':
            await handlePanic(interaction);
            break;
        case 'stats':
            await handleStats(interaction);
            break;
        case 'top_ture':
            await handleTopTure(interaction);
            break;
        case 'apply':
            await handleApply(interaction);
            break;
        case 'ticket':
            await handleTicket(interaction);
            break;
        case 'reload':
            await handleReload(interaction);
            break;
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM SESIUNE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSesiuneStart(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul <@&' + CONFIG.roles.sessionHost + '> pot porni sesiuni roleplay.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare dacă există deja o sesiune activă
    if (sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Există deja o sesiune activă!** Folosește `/sesiune_stop` pentru a o opri.',
            flags: MessageFlags.Ephemeral
        });
    }

    const rawLink = interaction.options.getString('link');
    const link = normalizeLink(rawLink);
    const locatie = interaction.options.getString('locatie');
    const frpSpeed = interaction.options.getInteger('frp');
    const startTime = Date.now();

    // Emoji pentru locație
    const locatieEmoji = {
        'RoadMap': '🗺️',
        'BrookeMere': '🏘️',
        'Horton': '🌆',
        'Ron Rivers': '🏞️'
    };

    // Salvare sesiune în Map
    sessionsMap.set('active', {
        startedBy: user.id,
        startedByTag: user.tag,
        link: link,
        locatie: locatie,
        frpSpeed: frpSpeed,
        startTime: startTime,
        shiftsCount: 0
    });

    // Creare embed profesional
    const embed = new EmbedBuilder()
        .setTitle('🎮 ═══════ SESIUNE ROLEPLAY ACTIVĂ ═══════')
        .setDescription(`
╔══════════════════════════════════════╗
       👋 **Bun venit pe EUGVRP România!**
╚══════════════════════════════════════╝

🌐 **Server Roblox:** [Click pentru a intra](${link})
🕐 **Ora start:** <t:${Math.floor(startTime / 1000)}:F>
📊 **Status:** 🟢 **ACTIVĂ**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *Intră rapid pe server și începe aventura!*
        `)
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👑 Session Host', value: `<@${user.id}>`, inline: true },
            { name: '👥 Membri în tură', value: '`0`', inline: true },
            { name: '📊 Status', value: '🟢 Activă', inline: true },
            { name: `${locatieEmoji[locatie] || '📍'} Locație`, value: `**${locatie}**`, inline: true },
            { name: '🚗 FRP Viteză Max', value: `**${frpSpeed} km/h**`, inline: true },
            { name: '🔗 Link Server', value: `[Deschide](${link})`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sesiune Roleplay', iconURL: guild.iconURL() })
        .setTimestamp()
        .setThumbnail(guild.iconURL({ size: 128 }));

    // Butoane pentru intrare pe server
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('🌐 Deschide Server')
                .setStyle(ButtonStyle.Link)
                .setURL(link),
            new ButtonBuilder()
                .setCustomId('join_server')
                .setLabel('🔒 Link Privat')
                .setStyle(ButtonStyle.Success)
        );

    // Trimitere în canalul de sesiune
    try {
        const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
        if (sesiuneChannel) {
            const message = await sesiuneChannel.send({
                content: `<@&${CONFIG.roles.cetateni}> <@&${CONFIG.roles.politie}> <@&${CONFIG.roles.pompieri}> <@&${CONFIG.roles.dot}> <@&${CONFIG.roles.earlyAccess}> @everyone @here`,
                embeds: [embed],
                components: [row]
            });
            sessionsMap.get('active').messageId = message.id;
        } else {
            console.error('❌ Canalul de sesiune nu a fost găsit!');
        }

        // Răspuns ephemeral
        await interaction.reply({
            content: `✅ **Sesiunea a fost pornită cu succes!**\n📍 Locație: **${locatie}**\n🚗 FRP: **${frpSpeed} km/h**\n\nJucătorii pot vedea sesiunea în <#${CONFIG.channels.sesiune}>`,
            flags: MessageFlags.Ephemeral
        });

        // Log
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 LOG: Sesiune pornită')
            .setColor(CONFIG.colors.session)
            .addFields(
                { name: '👑 Host', value: `<@${user.id}> (${user.tag})` },
                { name: '🔗 Link', value: link },
                { name: '📍 Locație', value: locatie, inline: true },
                { name: '🚗 FRP', value: `${frpSpeed} km/h`, inline: true },
                { name: '🕐 Ora', value: `<t:${Math.floor(startTime / 1000)}:F>` }
            )
            .setTimestamp();
        await sendLog(guild, logEmbed);

    } catch (error) {
        console.error('❌ Eroare la trimiterea sesiunii:', error);
        await interaction.reply({
            content: '❌ **Eroare la pornirea sesiunii!** Verifică permisiunile botului.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSesiuneStop(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul <@&' + CONFIG.roles.sessionHost + '> pot opri sesiuni.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare dacă există sesiune activă
    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Nu există nicio sesiune activă!**',
            flags: MessageFlags.Ephemeral
        });
    }

    const session = sessionsMap.get('active');
    const endTime = Date.now();
    const duration = endTime - session.startTime;

    // Calculare membri activi în tură
    const activeShifts = [];
    shiftsMap.forEach((shift, userId) => {
        if (shift.active) {
            activeShifts.push(userId);
        }
    });

    // Raport final sesiune
    const reportEmbed = new EmbedBuilder()
        .setTitle('📊 ═══════ RAPORT FINAL SESIUNE ═══════')
        .setDescription(`
🎮 **Sesiunea s-a încheiat!**

Mulțumim tuturor jucătorilor pentru participare! 👏
        `)
        .setColor(CONFIG.colors.warning)
        .addFields(
            { name: '👑 Oprit de', value: `<@${user.id}>`, inline: true },
            { name: '⏱️ Durată totală', value: formatDuration(duration), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '👥 Membri activi', value: `${activeShifts.length}`, inline: true },
            { name: '🚔 Ture totale', value: `${session.shiftsCount}`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Raport Sesiune', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere raport în canalul de sesiune
    const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
    if (sesiuneChannel) {
        await sesiuneChannel.send({ embeds: [reportEmbed] });
    }

    // Curățare date
    sessionsMap.delete('active');

    // Oprim toate turele active
    shiftsMap.forEach((shift, userId) => {
        if (shift.active) {
            shift.active = false;
            shift.endTime = endTime;
            shiftsMap.set(userId, shift);
        }
    });

    await interaction.reply({
        content: '✅ **Sesiunea a fost oprită!** Vezi raportul în <#' + CONFIG.channels.sesiune + '>',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Sesiune oprită')
        .setColor(CONFIG.colors.warning)
        .addFields(
            { name: '👑 Oprit de', value: `<@${user.id}> (${user.tag})` },
            { name: '⏱️ Durată', value: formatDuration(duration) }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleSesiuneStatus(interaction) {
    const { guild } = interaction;

    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Nu există nicio sesiune activă.**',
            flags: MessageFlags.Ephemeral
        });
    }

    const session = sessionsMap.get('active');
    const currentTime = Date.now();
    const duration = currentTime - session.startTime;

    const activeShifts = [];
    shiftsMap.forEach((shift, userId) => {
        if (shift.active) {
            activeShifts.push(userId);
        }
    });

    const statusEmbed = new EmbedBuilder()
        .setTitle('📊 ═══════ STATUS SESIUNE ═══════')
        .setDescription(`
🎮 **Sesiune Roleplay EUGVRP**

📍 **Server:** Activ
        `)
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👑 Host', value: `<@${session.startedBy}>`, inline: true },
            { name: '🕐 Start', value: `<t:${Math.floor(session.startTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată', value: formatDuration(duration), inline: true },
            { name: '📊 Status', value: '🟢 ACTIVĂ', inline: true },
            { name: '👥 În tură', value: `${activeShifts.length}`, inline: true },
            { name: '🚔 Ture totale', value: `${session.shiftsCount}`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [statusEmbed], flags: MessageFlags.Ephemeral });
}

async function handleSesiuneVote(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul <@&' + CONFIG.roles.sessionHost + '> pot porni voturi.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Initialize vote tracking
    const voteId = `vote_${Date.now()}`;
    votesMap.set(voteId, {
        da: [],
        nu: [],
        createdBy: user.id,
        messageId: null,
        voteId: voteId
    });

    // Creare embed pentru vot - mai frumos și organizat
    const voteEmbed = new EmbedBuilder()
        .setTitle('🗳️ ═══════ VOT SESIUNE ROLEPLAY ═══════')
        .setDescription(`
╔══════════════════════════════════════╗
   🎮 **O NOUĂ SESIUNE SE PREGĂTEȘTE!**
╚══════════════════════════════════════╝

📢 **Atenție, jucători!**
Un Session Host dorește să pornească o sesiune de roleplay!

🤔 **Ești pregătit să intri în joc?**
Votează mai jos pentru a ne spune părerea ta!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `)
        .setColor(CONFIG.colors.vote)
        .addFields(
            { name: '✅ DA - Sunt pregătit!', value: '```\n🟢 0 voturi\n```', inline: true },
            { name: '❌ NU - Nu acum', value: '```\n🔴 0 voturi\n```', inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '📊 Total Participanți', value: '```\n👥 0 persoane\n```', inline: true },
            { name: '👑 Inițiat de', value: `<@${user.id}>`, inline: true },
            { name: '⏰ Ora', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem de Votare | Votul este anonim pentru ceilalți jucători', iconURL: guild.iconURL() })
        .setTimestamp()
        .setThumbnail(guild.iconURL({ size: 128 }));

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`vote_da_${voteId}`)
                .setLabel('✅ DA - Sunt pregătit!')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId(`vote_nu_${voteId}`)
                .setLabel('❌ NU - Nu acum')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏸️'),
            new ButtonBuilder()
                .setCustomId(`vote_results_${voteId}`)
                .setLabel('📋 Vezi cine a votat')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👀')
        );

    // Trimitere în canalul de sesiune
    const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
    if (sesiuneChannel) {
        const message = await sesiuneChannel.send({
            content: `<@&${CONFIG.roles.cetateni}> @everyone @here\n\n🗳️ **VOT PENTRU SESIUNE ROLEPLAY!** 🗳️`,
            embeds: [voteEmbed],
            components: [row]
        });

        // Salvare message ID
        const voteData = votesMap.get(voteId);
        voteData.messageId = message.id;
        votesMap.set(voteId, voteData);
    }

    await interaction.reply({
        content: '✅ **Votul a fost pornit!** Jucătorii pot vota acum în <#' + CONFIG.channels.sesiune + '>\n\n💡 **Sfat:** Apasă pe butonul "📋 Vezi cine a votat" pentru a vedea votanții în timp real!',
        flags: MessageFlags.Ephemeral
    });
}
// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM TURE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTuraStart(interaction) {
    const { guild, member, user } = interaction;

    // Verificare sesiune activă
    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Nu există nicio sesiune activă!** Nu poți începe o tură fără sesiune. Folosește `/sesiune_vote` pentru a propune o sesiune.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare roluri permise
    const allowedRoles = [CONFIG.roles.politie, CONFIG.roles.pompieri, CONFIG.roles.dot];
    if (!hasAnyRole(member, allowedRoles)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Nu ai rolul necesar pentru a începe o tură.\n\n📌 Dacă vrei să faci parte dintr-un departament, folosește `/apply` pentru a aplica.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare dacă are deja o tură activă
    if (shiftsMap.has(user.id) && shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Ai deja o tură activă!** Folosește `/tura_stop` pentru a o opri.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Determinare departament
    const department = getDepartmentFromRoles(member);
    const startTime = Date.now();

    // Salvare tură
    shiftsMap.set(user.id, {
        userId: user.id,
        userTag: user.tag,
        department: department,
        startTime: startTime,
        endTime: null,
        active: true
    });

    // Incrementare contor ture în sesiune
    const session = sessionsMap.get('active');
    session.shiftsCount++;
    sessionsMap.set('active', session);

    // Creare embed
    const embed = new EmbedBuilder()
        .setTitle(`${getDepartmentEmoji(department)} ═══════ TURĂ ÎNCEPUTĂ ═══════`)
        .setDescription(`
🎮 **Un membru a intrat în tură!**

📍 Departament: **${getDepartmentName(department)}**
        `)
        .setColor(getDepartmentColor(department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(startTime / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Ture', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: `✅ **Tură începută!** Ești activ în departamentul **${getDepartmentName(department)}** ${getDepartmentEmoji(department)}`,
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Tură pornită')
        .setColor(getDepartmentColor(department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(department) },
            { name: '🕐 Ora', value: `<t:${Math.floor(startTime / 1000)}:F>` }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleTuraStop(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă are o tură activă
    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Nu ai nicio tură activă!** Folosește `/tura_start` pentru a începe o tură.',
            flags: MessageFlags.Ephemeral
        });
    }

    const shift = shiftsMap.get(user.id);
    const endTime = Date.now();
    const duration = endTime - shift.startTime;

    // Actualizare tură
    shift.active = false;
    shift.endTime = endTime;
    shiftsMap.set(user.id, shift);

    // Actualizare statistici
    const stats = initializeUserStats(user.id);
    stats.totalShifts++;
    stats.totalMinutes += Math.floor(duration / 60000);
    stats.department = shift.department;
    statsMap.set(user.id, stats);

    // Creare embed raport
    const embed = new EmbedBuilder()
        .setTitle(`${getDepartmentEmoji(shift.department)} ═══════ TURĂ FINALIZATĂ ═══════`)
        .setDescription(`
🎮 **Tură încheiată cu succes!**

📊 Mulțumim pentru serviciu!
        `)
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(shift.startTime / 1000)}:F>`, inline: true },
            { name: '🕐 Ora stop', value: `<t:${Math.floor(endTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată', value: formatDuration(duration), inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Ture', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: `✅ **Tură finalizată!** Durată: **${formatDuration(duration)}** ${getDepartmentEmoji(shift.department)}`,
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Tură oprită')
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(shift.department) },
            { name: '⏱️ Durată', value: formatDuration(duration) }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleTuraStatus(interaction) {
    const { guild, user } = interaction;

    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Nu ai nicio tură activă.** Folosește `/tura_start` pentru a începe o tură.',
            flags: MessageFlags.Ephemeral
        });
    }

    const shift = shiftsMap.get(user.id);
    const currentTime = Date.now();
    const duration = currentTime - shift.startTime;

    const embed = new EmbedBuilder()
        .setTitle(`${getDepartmentEmoji(shift.department)} ═══════ STATUS TURĂ ═══════`)
        .setDescription(`
🎮 **Tura ta activă**

📍 Departament: **${getDepartmentName(shift.department)}**
        `)
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(shift.startTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată curentă', value: formatDuration(duration), inline: true },
            { name: '📊 Status', value: '🟢 Activ', inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM RADIO
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRadio(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă utilizatorul este în tură
    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Nu ești în tură!** Trebuie să fii într-o tură activă pentru a folosi radio. Folosește `/tura_start` pentru a începe o tură.',
            flags: MessageFlags.Ephemeral
        });
    }

    const shift = shiftsMap.get(user.id);
    const mesaj = interaction.options.getString('mesaj');

    // Creare embed radio
    const embed = new EmbedBuilder()
        .setTitle('📡 ═══════ RADIO DISPATCH ═══════')
        .setDescription(`
📻 **Mesaj nou pe frecvența radio!**

💬 **"${mesaj}"**
        `)
        .setColor(CONFIG.colors.radio)
        .addFields(
            { name: '👮 De la', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: `${getDepartmentEmoji(shift.department)} ${getDepartmentName(shift.department)}`, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:t>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Radio', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: '✅ **Mesaj radio trimis!** 📡',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Radio')
        .setColor(CONFIG.colors.radio)
        .addFields(
            { name: '👮 De la', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(shift.department) },
            { name: '💬 Mesaj', value: mesaj }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM DISPECERAT 112
// ═══════════════════════════════════════════════════════════════════════════════

async function handle112(interaction) {
    const { guild, user } = interaction;

    const locatie = interaction.options.getString('locație');
    const mesaj = interaction.options.getString('mesaj');

    // Creare embed urgență
    const embed = new EmbedBuilder()
        .setTitle('🚨 ═══════ 112 DISPATCH - APEL DE URGENȚĂ ═══════')
        .setDescription(`
📞 **A fost primit un apel de urgență!**

📍 **Locație:** ${locatie}
💬 **Detalii:** ${mesaj}

⚠️ **Toate unitățile trebuie să răspundă!**
        `)
        .setColor(CONFIG.colors.emergency)
        .addFields(
            { name: '📞 Apelant', value: `<@${user.id}>`, inline: true },
            { name: '📍 Locație', value: locatie, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Dispecerat 112', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture cu ping la departamente
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({
            content: `🚨 **ALERARE GENERALĂ!** <@&${CONFIG.roles.politie}> <@&${CONFIG.roles.pompieri}> <@&${CONFIG.roles.dot}>`,
            embeds: [embed]
        });
    }

    await interaction.reply({
        content: '✅ **Apelul de urgență a fost trimis!** Toate unitățile au fost alertate. 🚨',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Apel 112')
        .setColor(CONFIG.colors.emergency)
        .addFields(
            { name: '📞 Apelant', value: `<@${user.id}> (${user.tag})` },
            { name: '📍 Locație', value: locatie },
            { name: '💬 Detalii', value: mesaj }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANIC BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

async function handlePanic(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Poliție
    if (!hasRole(member, CONFIG.roles.politie)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul **Poliție** 🚔 pot folosi butonul de panică!',
            flags: MessageFlags.Ephemeral
        });
    }

    // Creare embed panic
    const embed = new EmbedBuilder()
        .setTitle('🚨🚨🚨 ═══════ OFIȚER ÎN PERICOL ═══════ 🚨🚨🚨')
        .setDescription(`
⚠️ **URGENT! OFIȚER ÎN PERICOL!**

👮 Un ofițer de poliție solicită asistență URGENTĂ!
📍 Toate unitățile disponibile trebuie să răspundă!

🚨 **COD 10-13 - OFIȚER ÎN PERICOL!**
        `)
        .setColor(CONFIG.colors.panic)
        .addFields(
            { name: '👮 Ofițer', value: `<@${user.id}>`, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Panic Button', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture cu ping
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({
            content: `@everyone 🚨🚨🚨 **PANICĂ! OFIȚER ÎN PERICOL!** 🚨🚨🚨`,
            embeds: [embed]
        });
    }

    await interaction.reply({
        content: '✅ **Alerta de panică a fost trimisă!** Ajutorul vine! 🚨',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: PANIC BUTTON')
        .setColor(CONFIG.colors.panic)
        .addFields(
            { name: '👮 Ofițer', value: `<@${user.id}> (${user.tag})` },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICI
// ═══════════════════════════════════════════════════════════════════════════════

async function handleStats(interaction) {
    const targetUser = interaction.options.getUser('utilizator') || interaction.user;
    const stats = initializeUserStats(targetUser.id);

    const hours = Math.floor(stats.totalMinutes / 60);
    const minutes = stats.totalMinutes % 60;

    const embed = new EmbedBuilder()
        .setTitle('📊 ═══════ STATISTICI JUCĂTOR ═══════')
        .setDescription(`
🎮 **Statistici pentru ${targetUser.username}**

📈 Vezi performanța ta în joc!
        `)
        .setColor(stats.department ? getDepartmentColor(stats.department) : CONFIG.colors.session)
        .addFields(
            { name: '👤 Utilizator', value: `<@${targetUser.id}>`, inline: true },
            { name: '🏢 Departament', value: stats.department ? `${getDepartmentEmoji(stats.department)} ${getDepartmentName(stats.department)}` : '❌ Niciunul', inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '📋 Total ture', value: `${stats.totalShifts}`, inline: true },
            { name: '⏱️ Timp total', value: `${hours}h ${minutes}m`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTopTure(interaction) {
    const { guild } = interaction;

    // Sortare după minute
    const sortedStats = Array.from(statsMap.entries())
        .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
        .slice(0, 10);

    if (sortedStats.length === 0) {
        return interaction.reply({
            content: '❌ **Nu există încă statistici disponibile.** Începe o tură folosind `/tura_start`!',
            flags: MessageFlags.Ephemeral
        });
    }

    let description = '';
    let position = 1;

    for (const [userId, stats] of sortedStats) {
        const hours = Math.floor(stats.totalMinutes / 60);
        const minutes = stats.totalMinutes % 60;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
        const departmentEmoji = stats.department ? getDepartmentEmoji(stats.department) : '👤';

        description += `${medal} <@${userId}> - **${hours}h ${minutes}m** ${departmentEmoji}\n`;
        position++;
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 ═══════ TOP 10 MEMBRI ═══════')
        .setDescription(`
🎮 **Clasamentul jucătorilor activi!**

${description}

📌 Continuă să joci pentru a urca în clasament!
        `)
        .setColor(CONFIG.colors.session)
        .setFooter({ text: '🎮 EUGVRP România • Leaderboard', iconURL: guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM APLICAȚII
// ═══════════════════════════════════════════════════════════════════════════════

async function handleApply(interaction) {
    const { guild, user } = interaction;

    const departament = interaction.options.getString('departament');
    const departmentName = getDepartmentName(departament);
    const departmentColor = getDepartmentColor(departament);

    // Creare embed aplicație
    const embed = new EmbedBuilder()
        .setTitle('📝 ═══════ APLICAȚIE NOUĂ ═══════')
        .setDescription(`
📥 **Un jucător dorește să aplice!**

📝 Verifică profilul și decizia!
        `)
        .setColor(departmentColor)
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: `${getDepartmentEmoji(departament)} ${departmentName}` },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Aplicații', iconURL: guild.iconURL() })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${user.id}_${departament}`)
                .setLabel('✅ Acceptă')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`reject_${user.id}_${departament}`)
                .setLabel('❌ Respinge')
                .setStyle(ButtonStyle.Danger)
        );

    // Trimitere în canalul de loguri (staff)
    const logChannel = guild.channels.cache.get(CONFIG.channels.loguri);
    if (logChannel) {
        await logChannel.send({
            content: `<@&${CONFIG.roles.sessionHost}> 📝 **APLICAȚIE NOUĂ!**`,
            embeds: [embed],
            components: [row]
        });
    }

    // Salvare aplicație
    applicationsMap.set(user.id, {
        userId: user.id,
        userTag: user.tag,
        department: departament,
        timestamp: Date.now(),
        status: 'pending'
    });

    await interaction.reply({
        content: `✅ **Aplicația ta pentru ${getDepartmentEmoji(departament)} ${departmentName} a fost trimisă!** Veți primi un răspuns în curând.`,
        flags: MessageFlags.Ephemeral
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM TICKETS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTicket(interaction) {
    const { guild, user } = interaction;

    const motiv = interaction.options.getString('motiv');

    // Verificare dacă există deja un ticket
    const existingTicket = ticketsMap.get(user.id);
    if (existingTicket && existingTicket.open) {
        return interaction.reply({
            content: `❌ **Ai deja un ticket deschis:** <#${existingTicket.channelId}>`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Creare canal ticket
    const ticketChannel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            {
                id: guild.roles.everyone,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: CONFIG.roles.sessionHost,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ]
    });

    // Embed ticket
    const embed = new EmbedBuilder()
        .setTitle('🎫 ═══════ TICKET DE SUPORT ═══════')
        .setDescription(`
👋 **Bun venit!**

📝 **Motiv:** ${motiv}

💡 Un membru staff vă va ajuta în curând!
        `)
        .setColor(CONFIG.colors.ticket)
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Ticket-uri', iconURL: guild.iconURL() })
        .setTimestamp();

    const closeButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${user.id}`)
                .setLabel('🔒 Închide ticket')
                .setStyle(ButtonStyle.Danger)
        );

    await ticketChannel.send({
        content: `<@${user.id}> <@&${CONFIG.roles.sessionHost}>`,
        embeds: [embed],
        components: [closeButton]
    });

    // Salvare ticket
    ticketsMap.set(user.id, {
        userId: user.id,
        channelId: ticketChannel.id,
        reason: motiv,
        open: true,
        createdAt: Date.now()
    });

    await interaction.reply({
        content: `✅ **Ticket-ul tău a fost creat:** ${ticketChannel}`,
        flags: MessageFlags.Ephemeral
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELOAD COMENZI
// ═══════════════════════════════════════════════════════════════════════════════

async function handleReload(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă user-ul este owner-ul serverului
    if (user.id !== guild.ownerId) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar owner-ul serverului poate reîncărca comenzile.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Șterge toate comenzile vechi și înregistrează cele noi
        await guild.commands.set(commands);

        const embed = new EmbedBuilder()
            .setTitle('🔄 ═══════ RELOAD COMENZI ═══════')
            .setDescription(`
✅ **Comenzile au fost reîncărcate cu succes!**

📋 **Comenzi disponibile:**
• \`/sesiune_start\` - Pornește sesiune
• \`/sesiune_stop\` - Oprește sesiune
• \`/sesiune_status\` - Status sesiune
• \`/sesiune_vote\` - Vot sesiune
• \`/tura_start\` - Începe tură
• \`/tura_stop\` - Oprește tură
• \`/tura_status\` - Status tură
• \`/radio\` - Mesaj radio
• \`/112\` - Apel urgență
• \`/panic\` - Panic button
• \`/stats\` - Statistici
• \`/top_ture\` - Leaderboard
• \`/apply\` - Aplică departament
• \`/ticket\` - Ticket suport
• \`/reload\` - Reîncarcă comenzile

⚡ **Total: ${commands.length} comenzi active!**
            `)
            .setColor(CONFIG.colors.success)
            .addFields(
                { name: '👑 Reîncărcat de', value: `<@${user.id}> **(OWNER)**` },
                { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Log
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 LOG: Comenzile reîncărcate')
            .setColor(CONFIG.colors.success)
            .addFields(
                { name: '👑 De', value: `<@${user.id}> (${user.tag}) **OWNER**` },
                { name: '📊 Comenzi', value: `${commands.length}` }
            )
            .setTimestamp();
        await sendLog(guild, logEmbed);

        console.log(`✅ Comenzile au fost reîncărcate de ${user.tag} (OWNER)`);
    } catch (error) {
        console.error('❌ Eroare la reîncărcarea comenzilor:', error);
        await interaction.editReply({
            content: '❌ **Eroare la reîncărcarea comenzilor!** Verifică logurile pentru detalii.'
        });
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM SESIUNE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleSesiuneStart(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul <@&' + CONFIG.roles.sessionHost + '> pot porni sesiuni roleplay.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare dacă există deja o sesiune activă
    if (sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Există deja o sesiune activă!** Folosește `/sesiune_stop` pentru a o opri.',
            flags: MessageFlags.Ephemeral
        });
    }

    const rawLink = interaction.options.getString('link');
    const link = normalizeLink(rawLink);
    const locatie = interaction.options.getString('locatie');
    const frpSpeed = interaction.options.getInteger('frp');
    const startTime = Date.now();

    // Emoji pentru locație
    const locatieEmoji = {
        'RoadMap': '🗺️',
        'BrookeMere': '🏘️',
        'Horton': '🌆',
        'Ron Rivers': '🏞️'
    };

    // Salvare sesiune în Map
    sessionsMap.set('active', {
        startedBy: user.id,
        startedByTag: user.tag,
        link: link,
        locatie: locatie,
        frpSpeed: frpSpeed,
        startTime: startTime,
        shiftsCount: 0
    });

    // Creare embed profesional
    const embed = new EmbedBuilder()
        .setTitle('🎮 ═══════ SESIUNE ROLEPLAY ACTIVĂ ═══════')
        .setDescription(`
╔══════════════════════════════════════╗
       👋 **Bun venit pe EUGVRP România!**
╚══════════════════════════════════════╝

🌐 **Server Roblox:** [Click pentru a intra](${link})
🕐 **Ora start:** <t:${Math.floor(startTime / 1000)}:F>
📊 **Status:** 🟢 **ACTIVĂ**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ *Intră rapid pe server și începe aventura!*
        `)
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👑 Session Host', value: `<@${user.id}>`, inline: true },
            { name: '👥 Membri în tură', value: '`0`', inline: true },
            { name: '📊 Status', value: '🟢 Activă', inline: true },
            { name: `${locatieEmoji[locatie] || '📍'} Locație`, value: `**${locatie}**`, inline: true },
            { name: '🚗 FRP Viteză Max', value: `**${frpSpeed} km/h**`, inline: true },
            { name: '🔗 Link Server', value: `[Deschide](${link})`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sesiune Roleplay', iconURL: guild.iconURL() })
        .setTimestamp()
        .setThumbnail(guild.iconURL({ size: 128 }));

    // Butoane pentru intrare pe server
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('🌐 Deschide Server')
                .setStyle(ButtonStyle.Link)
                .setURL(link),
            new ButtonBuilder()
                .setCustomId('join_server')
                .setLabel('🔒 Link Privat')
                .setStyle(ButtonStyle.Success)
        );

    // Trimitere în canalul de sesiune
    try {
        const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
        if (sesiuneChannel) {
            const message = await sesiuneChannel.send({
                content: `<@&${CONFIG.roles.cetateni}> <@&${CONFIG.roles.politie}> <@&${CONFIG.roles.pompieri}> <@&${CONFIG.roles.dot}> <@&${CONFIG.roles.earlyAccess}> @everyone @here`,
                embeds: [embed],
                components: [row]
            });
            sessionsMap.get('active').messageId = message.id;
        } else {
            console.error('❌ Canalul de sesiune nu a fost găsit!');
        }

        // Răspuns ephemeral
        await interaction.reply({
            content: `✅ **Sesiunea a fost pornită cu succes!**\n📍 Locație: **${locatie}**\n🚗 FRP: **${frpSpeed} km/h**\n\nJucătorii pot vedea sesiunea în <#${CONFIG.channels.sesiune}>`,
            flags: MessageFlags.Ephemeral
        });

        // Log
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 LOG: Sesiune pornită')
            .setColor(CONFIG.colors.session)
            .addFields(
                { name: '👑 Host', value: `<@${user.id}> (${user.tag})` },
                { name: '🔗 Link', value: link },
                { name: '📍 Locație', value: locatie, inline: true },
                { name: '🚗 FRP', value: `${frpSpeed} km/h`, inline: true },
                { name: '🕐 Ora', value: `<t:${Math.floor(startTime / 1000)}:F>` }
            )
            .setTimestamp();
        await sendLog(guild, logEmbed);

    } catch (error) {
        console.error('❌ Eroare la trimiterea sesiunii:', error);
        await interaction.reply({
            content: '❌ **Eroare la pornirea sesiunii!** Verifică permisiunile botului.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSesiuneStop(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul <@&' + CONFIG.roles.sessionHost + '> pot opri sesiuni.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare dacă există sesiune activă
    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Nu există nicio sesiune activă!**',
            flags: MessageFlags.Ephemeral
        });
    }

    const session = sessionsMap.get('active');
    const endTime = Date.now();
    const duration = endTime - session.startTime;

    // Calculare membri activi în tură
    const activeShifts = [];
    shiftsMap.forEach((shift, userId) => {
        if (shift.active) {
            activeShifts.push(userId);
        }
    });

    // Raport final sesiune
    const reportEmbed = new EmbedBuilder()
        .setTitle('📊 ═══════ RAPORT FINAL SESIUNE ═══════')
        .setDescription(`
🎮 **Sesiunea s-a încheiat!**

Mulțumim tuturor jucătorilor pentru participare! 👏
        `)
        .setColor(CONFIG.colors.warning)
        .addFields(
            { name: '👑 Oprit de', value: `<@${user.id}>`, inline: true },
            { name: '⏱️ Durată totală', value: formatDuration(duration), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '👥 Membri activi', value: `${activeShifts.length}`, inline: true },
            { name: '🚔 Ture totale', value: `${session.shiftsCount}`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Raport Sesiune', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere raport în canalul de sesiune
    const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
    if (sesiuneChannel) {
        await sesiuneChannel.send({ embeds: [reportEmbed] });
    }

    // Curățare date
    sessionsMap.delete('active');

    // Oprim toate turele active
    shiftsMap.forEach((shift, userId) => {
        if (shift.active) {
            shift.active = false;
            shift.endTime = endTime;
            shiftsMap.set(userId, shift);
        }
    });

    await interaction.reply({
        content: '✅ **Sesiunea a fost oprită!** Vezi raportul în <#' + CONFIG.channels.sesiune + '>',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Sesiune oprită')
        .setColor(CONFIG.colors.warning)
        .addFields(
            { name: '👑 Oprit de', value: `<@${user.id}> (${user.tag})` },
            { name: '⏱️ Durată', value: formatDuration(duration) }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleSesiuneStatus(interaction) {
    const { guild } = interaction;

    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Nu există nicio sesiune activă.**',
            flags: MessageFlags.Ephemeral
        });
    }

    const session = sessionsMap.get('active');
    const currentTime = Date.now();
    const duration = currentTime - session.startTime;

    const activeShifts = [];
    shiftsMap.forEach((shift, userId) => {
        if (shift.active) {
            activeShifts.push(userId);
        }
    });

    const statusEmbed = new EmbedBuilder()
        .setTitle('📊 ═══════ STATUS SESIUNE ═══════')
        .setDescription(`
🎮 **Sesiune Roleplay EUGVRP**

📍 **Server:** Activ
        `)
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👑 Host', value: `<@${session.startedBy}>`, inline: true },
            { name: '🕐 Start', value: `<t:${Math.floor(session.startTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată', value: formatDuration(duration), inline: true },
            { name: '📊 Status', value: '🟢 ACTIVĂ', inline: true },
            { name: '👥 În tură', value: `${activeShifts.length}`, inline: true },
            { name: '🚔 Ture totale', value: `${session.shiftsCount}`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [statusEmbed], flags: MessageFlags.Ephemeral });
}

async function handleSesiuneVote(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul <@&' + CONFIG.roles.sessionHost + '> pot porni voturi.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Initialize vote tracking
    const voteId = `vote_${Date.now()}`;
    votesMap.set(voteId, {
        da: [],
        nu: [],
        createdBy: user.id,
        messageId: null,
        voteId: voteId
    });

    // Creare embed pentru vot - mai frumos și organizat
    const voteEmbed = new EmbedBuilder()
        .setTitle('🗳️ ═══════ VOT SESIUNE ROLEPLAY ═══════')
        .setDescription(`
╔══════════════════════════════════════╗
   🎮 **O NOUĂ SESIUNE SE PREGĂTEȘTE!**
╚══════════════════════════════════════╝

📢 **Atenție, jucători!**
Un Session Host dorește să pornească o sesiune de roleplay!

🤔 **Ești pregătit să intri în joc?**
Votează mai jos pentru a ne spune părerea ta!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `)
        .setColor(CONFIG.colors.vote)
        .addFields(
            { name: '✅ DA - Sunt pregătit!', value: '```\n🟢 0 voturi\n```', inline: true },
            { name: '❌ NU - Nu acum', value: '```\n🔴 0 voturi\n```', inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '📊 Total Participanți', value: '```\n👥 0 persoane\n```', inline: true },
            { name: '👑 Inițiat de', value: `<@${user.id}>`, inline: true },
            { name: '⏰ Ora', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem de Votare | Votul este anonim pentru ceilalți jucători', iconURL: guild.iconURL() })
        .setTimestamp()
        .setThumbnail(guild.iconURL({ size: 128 }));

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`vote_da_${voteId}`)
                .setLabel('✅ DA - Sunt pregătit!')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId(`vote_nu_${voteId}`)
                .setLabel('❌ NU - Nu acum')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⏸️'),
            new ButtonBuilder()
                .setCustomId(`vote_results_${voteId}`)
                .setLabel('📋 Vezi cine a votat')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👀')
        );

    // Trimitere în canalul de sesiune
    const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
    if (sesiuneChannel) {
        const message = await sesiuneChannel.send({
            content: `<@&${CONFIG.roles.cetateni}> @everyone @here\n\n🗳️ **VOT PENTRU SESIUNE ROLEPLAY!** 🗳️`,
            embeds: [voteEmbed],
            components: [row]
        });

        // Salvare message ID
        const voteData = votesMap.get(voteId);
        voteData.messageId = message.id;
        votesMap.set(voteId, voteData);
    }

    await interaction.reply({
        content: '✅ **Votul a fost pornit!** Jucătorii pot vota acum în <#' + CONFIG.channels.sesiune + '>\n\n💡 **Sfat:** Apasă pe butonul "📋 Vezi cine a votat" pentru a vedea votanții în timp real!',
        flags: MessageFlags.Ephemeral
    });
}
//PARTEA 3/4 - index.js (continuare)
// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM TURE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTuraStart(interaction) {
    const { guild, member, user } = interaction;

    // Verificare sesiune activă
    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ **Nu există nicio sesiune activă!** Nu poți începe o tură fără sesiune. Folosește `/sesiune_vote` pentru a propune o sesiune.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare roluri permise
    const allowedRoles = [CONFIG.roles.politie, CONFIG.roles.pompieri, CONFIG.roles.dot];
    if (!hasAnyRole(member, allowedRoles)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Nu ai rolul necesar pentru a începe o tură.\n\n📌 Dacă vrei să faci parte dintr-un departament, folosește `/apply` pentru a aplica.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Verificare dacă are deja o tură activă
    if (shiftsMap.has(user.id) && shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Ai deja o tură activă!** Folosește `/tura_stop` pentru a o opri.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Determinare departament
    const department = getDepartmentFromRoles(member);
    const startTime = Date.now();

    // Salvare tură
    shiftsMap.set(user.id, {
        userId: user.id,
        userTag: user.tag,
        department: department,
        startTime: startTime,
        endTime: null,
        active: true
    });

    // Incrementare contor ture în sesiune
    const session = sessionsMap.get('active');
    session.shiftsCount++;
    sessionsMap.set('active', session);

    // Creare embed
    const embed = new EmbedBuilder()
        .setTitle(`${getDepartmentEmoji(department)} ═══════ TURĂ ÎNCEPUTĂ ═══════`)
        .setDescription(`
🎮 **Un membru a intrat în tură!**

📍 Departament: **${getDepartmentName(department)}**
        `)
        .setColor(getDepartmentColor(department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(startTime / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Ture', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: `✅ **Tură începută!** Ești activ în departamentul **${getDepartmentName(department)}** ${getDepartmentEmoji(department)}`,
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Tură pornită')
        .setColor(getDepartmentColor(department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(department) },
            { name: '🕐 Ora', value: `<t:${Math.floor(startTime / 1000)}:F>` }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleTuraStop(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă are o tură activă
    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Nu ai nicio tură activă!** Folosește `/tura_start` pentru a începe o tură.',
            flags: MessageFlags.Ephemeral
        });
    }

    const shift = shiftsMap.get(user.id);
    const endTime = Date.now();
    const duration = endTime - shift.startTime;

    // Actualizare tură
    shift.active = false;
    shift.endTime = endTime;
    shiftsMap.set(user.id, shift);

    // Actualizare statistici
    const stats = initializeUserStats(user.id);
    stats.totalShifts++;
    stats.totalMinutes += Math.floor(duration / 60000);
    stats.department = shift.department;
    statsMap.set(user.id, stats);

    // Creare embed raport
    const embed = new EmbedBuilder()
        .setTitle(`${getDepartmentEmoji(shift.department)} ═══════ TURĂ FINALIZATĂ ═══════`)
        .setDescription(`
🎮 **Tură încheiată cu succes!**

📊 Mulțumim pentru serviciu!
        `)
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(shift.startTime / 1000)}:F>`, inline: true },
            { name: '🕐 Ora stop', value: `<t:${Math.floor(endTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată', value: formatDuration(duration), inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Ture', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: `✅ **Tură finalizată!** Durată: **${formatDuration(duration)}** ${getDepartmentEmoji(shift.department)}`,
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Tură oprită')
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '👮 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(shift.department) },
            { name: '⏱️ Durată', value: formatDuration(duration) }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleTuraStatus(interaction) {
    const { guild, user } = interaction;

    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Nu ai nicio tură activă.** Folosește `/tura_start` pentru a începe o tură.',
            flags: MessageFlags.Ephemeral
        });
    }

    const shift = shiftsMap.get(user.id);
    const currentTime = Date.now();
    const duration = currentTime - shift.startTime;

    const embed = new EmbedBuilder()
        .setTitle(`${getDepartmentEmoji(shift.department)} ═══════ STATUS TURĂ ═══════`)
        .setDescription(`
🎮 **Tura ta activă**

📍 Departament: **${getDepartmentName(shift.department)}**
        `)
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(shift.startTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată curentă', value: formatDuration(duration), inline: true },
            { name: '📊 Status', value: '🟢 Activ', inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM RADIO
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRadio(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă utilizatorul este în tură
    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ **Nu ești în tură!** Trebuie să fii într-o tură activă pentru a folosi radio. Folosește `/tura_start` pentru a începe o tură.',
            flags: MessageFlags.Ephemeral
        });
    }

    const shift = shiftsMap.get(user.id);
    const mesaj = interaction.options.getString('mesaj');

    // Creare embed radio
    const embed = new EmbedBuilder()
        .setTitle('📡 ═══════ RADIO DISPATCH ═══════')
        .setDescription(`
📻 **Mesaj nou pe frecvența radio!**

💬 **"${mesaj}"**
        `)
        .setColor(CONFIG.colors.radio)
        .addFields(
            { name: '👮 De la', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: `${getDepartmentEmoji(shift.department)} ${getDepartmentName(shift.department)}`, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:t>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Radio', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: '✅ **Mesaj radio trimis!** 📡',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Radio')
        .setColor(CONFIG.colors.radio)
        .addFields(
            { name: '👮 De la', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(shift.department) },
            { name: '💬 Mesaj', value: mesaj }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM DISPECERAT 112
// ═══════════════════════════════════════════════════════════════════════════════

async function handle112(interaction) {
    const { guild, user } = interaction;

    const locatie = interaction.options.getString('locație');
    const mesaj = interaction.options.getString('mesaj');

    // Creare embed urgență
    const embed = new EmbedBuilder()
        .setTitle('🚨 ═══════ 112 DISPATCH - APEL DE URGENȚĂ ═══════')
        .setDescription(`
📞 **A fost primit un apel de urgență!**

📍 **Locație:** ${locatie}
💬 **Detalii:** ${mesaj}

⚠️ **Toate unitățile trebuie să răspundă!**
        `)
        .setColor(CONFIG.colors.emergency)
        .addFields(
            { name: '📞 Apelant', value: `<@${user.id}>`, inline: true },
            { name: '📍 Locație', value: locatie, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Dispecerat 112', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture cu ping la departamente
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({
            content: `🚨 **ALERARE GENERALĂ!** <@&${CONFIG.roles.politie}> <@&${CONFIG.roles.pompieri}> <@&${CONFIG.roles.dot}>`,
            embeds: [embed]
        });
    }

    await interaction.reply({
        content: '✅ **Apelul de urgență a fost trimis!** Toate unitățile au fost alertate. 🚨',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Apel 112')
        .setColor(CONFIG.colors.emergency)
        .addFields(
            { name: '📞 Apelant', value: `<@${user.id}> (${user.tag})` },
            { name: '📍 Locație', value: locatie },
            { name: '💬 Detalii', value: mesaj }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANIC BUTTON
// ═══════════════════════════════════════════════════════════════════════════════

async function handlePanic(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Poliție
    if (!hasRole(member, CONFIG.roles.politie)) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar membrii cu rolul **Poliție** 🚔 pot folosi butonul de panică!',
            flags: MessageFlags.Ephemeral
        });
    }

    // Creare embed panic
    const embed = new EmbedBuilder()
        .setTitle('🚨🚨🚨 ═══════ OFIȚER ÎN PERICOL ═══════ 🚨🚨🚨')
        .setDescription(`
⚠️ **URGENT! OFIȚER ÎN PERICOL!**

👮 Un ofițer de poliție solicită asistență URGENTĂ!
📍 Toate unitățile disponibile trebuie să răspundă!

🚨 **COD 10-13 - OFIȚER ÎN PERICOL!**
        `)
        .setColor(CONFIG.colors.panic)
        .addFields(
            { name: '👮 Ofițer', value: `<@${user.id}>`, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România • Panic Button', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture cu ping
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({
            content: `@everyone 🚨🚨🚨 **PANICĂ! OFIȚER ÎN PERICOL!** 🚨🚨🚨`,
            embeds: [embed]
        });
    }

    await interaction.reply({
        content: '✅ **Alerta de panică a fost trimisă!** Ajutorul vine! 🚨',
        flags: MessageFlags.Ephemeral
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: PANIC BUTTON')
        .setColor(CONFIG.colors.panic)
        .addFields(
            { name: '👮 Ofițer', value: `<@${user.id}> (${user.tag})` },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICI
// ═══════════════════════════════════════════════════════════════════════════════

async function handleStats(interaction) {
    const targetUser = interaction.options.getUser('utilizator') || interaction.user;
    const stats = initializeUserStats(targetUser.id);

    const hours = Math.floor(stats.totalMinutes / 60);
    const minutes = stats.totalMinutes % 60;

    const embed = new EmbedBuilder()
        .setTitle('📊 ═══════ STATISTICI JUCĂTOR ═══════')
        .setDescription(`
🎮 **Statistici pentru ${targetUser.username}**

📈 Vezi performanța ta în joc!
        `)
        .setColor(stats.department ? getDepartmentColor(stats.department) : CONFIG.colors.session)
        .addFields(
            { name: '👤 Utilizator', value: `<@${targetUser.id}>`, inline: true },
            { name: '🏢 Departament', value: stats.department ? `${getDepartmentEmoji(stats.department)} ${getDepartmentName(stats.department)}` : '❌ Niciunul', inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: '📋 Total ture', value: `${stats.totalShifts}`, inline: true },
            { name: '⏱️ Timp total', value: `${hours}h ${minutes}m`, inline: true },
            { name: '\u200b', value: '\u200b', inline: true }
        )
        .setFooter({ text: '🎮 EUGVRP România', iconURL: interaction.guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTopTure(interaction) {
    const { guild } = interaction;

    // Sortare după minute
    const sortedStats = Array.from(statsMap.entries())
        .sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
        .slice(0, 10);

    if (sortedStats.length === 0) {
        return interaction.reply({
            content: '❌ **Nu există încă statistici disponibile.** Începe o tură folosind `/tura_start`!',
            flags: MessageFlags.Ephemeral
        });
    }

    let description = '';
    let position = 1;

    for (const [userId, stats] of sortedStats) {
        const hours = Math.floor(stats.totalMinutes / 60);
        const minutes = stats.totalMinutes % 60;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
        const departmentEmoji = stats.department ? getDepartmentEmoji(stats.department) : '👤';

        description += `${medal} <@${userId}> - **${hours}h ${minutes}m** ${departmentEmoji}\n`;
        position++;
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 ═══════ TOP 10 MEMBRI ═══════')
        .setDescription(`
🎮 **Clasamentul jucătorilor activi!**

${description}

📌 Continuă să joci pentru a urca în clasament!
        `)
        .setColor(CONFIG.colors.session)
        .setFooter({ text: '🎮 EUGVRP România • Leaderboard', iconURL: guild.iconURL() })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM APLICAȚII
// ═══════════════════════════════════════════════════════════════════════════════

async function handleApply(interaction) {
    const { guild, user } = interaction;

    const departament = interaction.options.getString('departament');
    const departmentName = getDepartmentName(departament);
    const departmentColor = getDepartmentColor(departament);

    // Creare embed aplicație
    const embed = new EmbedBuilder()
        .setTitle('📝 ═══════ APLICAȚIE NOUĂ ═══════')
        .setDescription(`
📥 **Un jucător dorește să aplice!**

📝 Verifică profilul și decizia!
        `)
        .setColor(departmentColor)
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: `${getDepartmentEmoji(departament)} ${departmentName}` },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Aplicații', iconURL: guild.iconURL() })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${user.id}_${departament}`)
                .setLabel('✅ Acceptă')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`reject_${user.id}_${departament}`)
                .setLabel('❌ Respinge')
                .setStyle(ButtonStyle.Danger)
        );

    // Trimitere în canalul de loguri (staff)
    const logChannel = guild.channels.cache.get(CONFIG.channels.loguri);
    if (logChannel) {
        await logChannel.send({
            content: `<@&${CONFIG.roles.sessionHost}> 📝 **APLICAȚIE NOUĂ!**`,
            embeds: [embed],
            components: [row]
        });
    }

    // Salvare aplicație
    applicationsMap.set(user.id, {
        userId: user.id,
        userTag: user.tag,
        department: departament,
        timestamp: Date.now(),
        status: 'pending'
    });

    await interaction.reply({
        content: `✅ **Aplicația ta pentru ${getDepartmentEmoji(departament)} ${departmentName} a fost trimisă!** Veți primi un răspuns în curând.`,
        flags: MessageFlags.Ephemeral
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM TICKETS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleTicket(interaction) {
    const { guild, user } = interaction;

    const motiv = interaction.options.getString('motiv');

    // Verificare dacă există deja un ticket
    const existingTicket = ticketsMap.get(user.id);
    if (existingTicket && existingTicket.open) {
        return interaction.reply({
            content: `❌ **Ai deja un ticket deschis:** <#${existingTicket.channelId}>`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Creare canal ticket
    const ticketChannel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            {
                id: guild.roles.everyone,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: CONFIG.roles.sessionHost,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            }
        ]
    });

    // Embed ticket
    const embed = new EmbedBuilder()
        .setTitle('🎫 ═══════ TICKET DE SUPORT ═══════')
        .setDescription(`
👋 **Bun venit!**

📝 **Motiv:** ${motiv}

💡 Un membru staff vă va ajuta în curând!
        `)
        .setColor(CONFIG.colors.ticket)
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: '🎮 EUGVRP România • Sistem Ticket-uri', iconURL: guild.iconURL() })
        .setTimestamp();

    const closeButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`close_ticket_${user.id}`)
                .setLabel('🔒 Închide ticket')
                .setStyle(ButtonStyle.Danger)
        );

    await ticketChannel.send({
        content: `<@${user.id}> <@&${CONFIG.roles.sessionHost}>`,
        embeds: [embed],
        components: [closeButton]
    });

    // Salvare ticket
    ticketsMap.set(user.id, {
        userId: user.id,
        channelId: ticketChannel.id,
        reason: motiv,
        open: true,
        createdAt: Date.now()
    });

    await interaction.reply({
        content: `✅ **Ticket-ul tău a fost creat:** ${ticketChannel}`,
        flags: MessageFlags.Ephemeral
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELOAD COMENZI
// ═══════════════════════════════════════════════════════════════════════════════

async function handleReload(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă user-ul este owner-ul serverului
    if (user.id !== guild.ownerId) {
        return interaction.reply({
            content: '❌ **ACCES REFUZAT!** Doar owner-ul serverului poate reîncărca comenzile.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        // Șterge toate comenzile vechi și înregistrează cele noi
        await guild.commands.set(commands);

        const embed = new EmbedBuilder()
            .setTitle('🔄 ═══════ RELOAD COMENZI ═══════')
            .setDescription(`
✅ **Comenzile au fost reîncărcate cu succes!**

📋 **Comenzi disponibile:**
• \`/sesiune_start\` - Pornește sesiune
• \`/sesiune_stop\` - Oprește sesiune
• \`/sesiune_status\` - Status sesiune
• \`/sesiune_vote\` - Vot sesiune
• \`/tura_start\` - Începe tură
• \`/tura_stop\` - Oprește tură
• \`/tura_status\` - Status tură
• \`/radio\` - Mesaj radio
• \`/112\` - Apel urgență
• \`/panic\` - Panic button
• \`/stats\` - Statistici
• \`/top_ture\` - Leaderboard
• \`/apply\` - Aplică departament
• \`/ticket\` - Ticket suport
• \`/reload\` - Reîncarcă comenzile

⚡ **Total: ${commands.length} comenzi active!**
            `)
            .setColor(CONFIG.colors.success)
            .addFields(
                { name: '👑 Reîncărcat de', value: `<@${user.id}> **(OWNER)**` },
                { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Log
        const logEmbed = new EmbedBuilder()
            .setTitle('📋 LOG: Comenzile reîncărcate')
            .setColor(CONFIG.colors.success)
            .addFields(
                { name: '👑 De', value: `<@${user.id}> (${user.tag}) **OWNER**` },
                { name: '📊 Comenzi', value: `${commands.length}` }
            )
            .setTimestamp();
        await sendLog(guild, logEmbed);

        console.log(`✅ Comenzile au fost reîncărcate de ${user.tag} (OWNER)`);
    } catch (error) {
        console.error('❌ Eroare la reîncărcarea comenzilor:', error);
        await interaction.editReply({
            content: '❌ **Eroare la reîncărcarea comenzilor!** Verifică logurile pentru detalii.'
        });
    }
}
//PARTEA 4/4 - index.js (ULTIMA PARTE)
// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER BUTOANE
// ═══════════════════════════════════════════════════════════════════════════════

async function handleButton(interaction) {
    const { customId, guild, member, user } = interaction;

    // BUTON JOIN SERVER
    if (customId === 'join_server') {
        const allowedRoles = [
            CONFIG.roles.politie,
            CONFIG.roles.pompieri,
            CONFIG.roles.dot,
            CONFIG.roles.sessionHost,
            CONFIG.roles.earlyAccess
        ];

        if (!hasAnyRole(member, allowedRoles)) {
            return interaction.reply({
                content: '❌ **ACCES REFUZAT!** Sesiunea nu este disponibilă pentru tine. Aplică pentru un departament folosind `/apply`.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!sessionsMap.has('active')) {
            return interaction.reply({
                content: '❌ **Nu există nicio sesiune activă.**',
                flags: MessageFlags.Ephemeral
            });
        }

        const session = sessionsMap.get('active');
        return interaction.reply({
            content: `🎮 **Link server Roblox:**\n${session.link}`,
            flags: MessageFlags.Ephemeral
        });
    }

    // BUTOANE VOT DA (cu ID dinamic)
    if (customId.startsWith('vote_da_')) {
        const voteId = customId.replace('vote_da_', '');
        const voteData = votesMap.get(voteId);
        
        if (!voteData) {
            return interaction.reply({
                content: '❌ **Votul nu mai există sau a expirat.**',
                flags: MessageFlags.Ephemeral
            });
        }

        // Verificare dacă a votat deja DA
        if (voteData.da.includes(user.id)) {
            return interaction.reply({
                content: '✅ **Ai votat deja DA!** Așteaptă rezultatele.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Remove from NU if present
        if (voteData.nu.includes(user.id)) {
            voteData.nu = voteData.nu.filter(id => id !== user.id);
        }

        voteData.da.push(user.id);
        votesMap.set(voteId, voteData);

        // Update embed în timp real
        await updateVoteEmbed(guild, voteData, voteId);

        return interaction.reply({
            content: '✅ **Ai votat DA!** 🎉 Votul tău a fost înregistrat. Mulțumim pentru participare!',
            flags: MessageFlags.Ephemeral
        });
    }

    // BUTOANE VOT NU (cu ID dinamic)
    if (customId.startsWith('vote_nu_')) {
        const voteId = customId.replace('vote_nu_', '');
        const voteData = votesMap.get(voteId);
        
        if (!voteData) {
            return interaction.reply({
                content: '❌ **Votul nu mai există sau a expirat.**',
                flags: MessageFlags.Ephemeral
            });
        }

        // Verificare dacă a votat deja NU
        if (voteData.nu.includes(user.id)) {
            return interaction.reply({
                content: '✅ **Ai votat deja NU!** Așteaptă rezultatele.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Remove from DA if present
        if (voteData.da.includes(user.id)) {
            voteData.da = voteData.da.filter(id => id !== user.id);
        }

        voteData.nu.push(user.id);
        votesMap.set(voteId, voteData);

        // Update embed în timp real
        await updateVoteEmbed(guild, voteData, voteId);

        return interaction.reply({
            content: '✅ **Ai votat NU!** Votul tău a fost înregistrat. Poate data viitoare!',
            flags: MessageFlags.Ephemeral
        });
    }

    // BUTON VEZI CINE A VOTAT (doar Session Host)
    if (customId.startsWith('vote_results_')) {
        const voteId = customId.replace('vote_results_', '');
        const voteData = votesMap.get(voteId);
        
        if (!voteData) {
            return interaction.reply({
                content: '❌ **Votul nu mai există sau a expirat.**',
                flags: MessageFlags.Ephemeral
            });
        }

        // Verificare dacă este Session Host
        if (!hasRole(member, CONFIG.roles.sessionHost)) {
            return interaction.reply({
                content: '❌ **ACCES REFUZAT!** Doar Session Host poate vedea cine a votat.\n\n📊 **Rezultate publice:**\n✅ DA: `' + voteData.da.length + '` voturi\n❌ NU: `' + voteData.nu.length + '` voturi',
                flags: MessageFlags.Ephemeral
            });
        }

        // Creare liste cu votanți
        const daList = voteData.da.length > 0 
            ? voteData.da.map((id, index) => `${index + 1}. <@${id}>`).join('\n') 
            : '*Nimeni nu a votat încă*';
        const nuList = voteData.nu.length > 0 
            ? voteData.nu.map((id, index) => `${index + 1}. <@${id}>`).join('\n') 
            : '*Nimeni nu a votat încă*';

        const totalVotes = voteData.da.length + voteData.nu.length;
        const daPercent = totalVotes > 0 ? Math.round((voteData.da.length / totalVotes) * 100) : 0;
        const nuPercent = totalVotes > 0 ? Math.round((voteData.nu.length / totalVotes) * 100) : 0;

        const embed = new EmbedBuilder()
            .setTitle('📋 ═══════ REZULTATE VOT DETALIATE ═══════')
            .setDescription(`
╔══════════════════════════════════════╗
   👑 **VIZUALIZARE EXCLUSIVĂ SESSION HOST**
╚══════════════════════════════════════╝

📊 **Statistici Vot:**
\`\`\`
✅ DA:  ${voteData.da.length} voturi (${daPercent}%)
❌ NU:  ${voteData.nu.length} voturi (${nuPercent}%)
━━━━━━━━━━━━━━━━━━━━━━━━━
👥 TOTAL: ${totalVotes} participanți
\`\`\`
            `)
            .setColor(CONFIG.colors.vote)
            .addFields(
                { name: `✅ AU VOTAT DA (${voteData.da.length})`, value: daList, inline: true },
                { name: `❌ AU VOTAT NU (${voteData.nu.length})`, value: nuList, inline: true }
            )
            .setFooter({ text: '🔒 Această informație este vizibilă doar pentru tine', iconURL: guild.iconURL() })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Backward compatibility pentru butoanele vechi
    if (customId === 'vote_da' || customId === 'vote_nu' || customId === 'vote_results') {
        return interaction.reply({
            content: '❌ **Acest vot a expirat.** Te rog să aștepți un vot nou.',
            flags: MessageFlags.Ephemeral
        });
    }

    // BUTON ACCEPTĂ APLICAȚIE
    if (customId.startsWith('accept_')) {
        if (!hasRole(member, CONFIG.roles.sessionHost)) {
            return interaction.reply({
                content: '❌ **ACCES REFUZAT!** Doar Session Host poate accepta aplicații.',
                flags: MessageFlags.Ephemeral
            });
        }

        const parts = customId.split('_');
        const applicantId = parts[1];
        const department = parts[2];
        const applicant = await guild.members.fetch(applicantId).catch(() => null);

        if (!applicant) {
            return interaction.reply({
                content: '❌ **Utilizatorul nu mai este pe server.**',
                flags: MessageFlags.Ephemeral
            });
        }

        // Adăugare rol
        const roleId = CONFIG.roles[department];
        await applicant.roles.add(roleId);

        // Actualizare aplicație
        if (applicationsMap.has(applicantId)) {
            const app = applicationsMap.get(applicantId);
            app.status = 'accepted';
            applicationsMap.set(applicantId, app);
        }

        const embed = new EmbedBuilder()
            .setTitle('✅ ═══════ APLICAȚIE ACCEPTATĂ ═══════')
            .setDescription(`
🎉 **Felicitări! Aplicația a fost acceptată!**

📋 Detaliile aplicării:
            `)
            .setColor(getDepartmentColor(department))
            .addFields(
                { name: '👤 Utilizator', value: `<@${applicantId}>` },
                { name: '🏢 Departament', value: `${getDepartmentEmoji(department)} ${getDepartmentName(department)}` },
                { name: '✅ Acceptat de', value: `<@${user.id}>` }
            )
            .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        // Notificare utilizator
        try {
            await applicant.send(`🎉 **Felicitări!** Aplicația ta pentru **${getDepartmentName(department)}** ${getDepartmentEmoji(department)} a fost acceptată! Bine ai venit în echipă!`);
        } catch (e) {
            // Nu putem trimite DM
        }

        return;
    }

    // BUTON RESPINGE APLICAȚIE
    if (customId.startsWith('reject_')) {
        if (!hasRole(member, CONFIG.roles.sessionHost)) {
            return interaction.reply({
                content: '❌ **ACCES REFUZAT!** Doar Session Host poate respinge aplicații.',
                flags: MessageFlags.Ephemeral
            });
        }

        const parts = customId.split('_');
        const applicantId = parts[1];
        const department = parts[2];

        // Actualizare aplicație
        if (applicationsMap.has(applicantId)) {
            const app = applicationsMap.get(applicantId);
            app.status = 'rejected';
            applicationsMap.set(applicantId, app);
        }

        const embed = new EmbedBuilder()
            .setTitle('❌ ═══════ APLICAȚIE RESPINSĂ ═══════')
            .setDescription(`
📋 **Aplicația a fost respinsă.**

Încurajăm candidatul să aplice din nou în viitor.
            `)
            .setColor(CONFIG.colors.error)
            .addFields(
                { name: '👤 Utilizator', value: `<@${applicantId}>` },
                { name: '🏢 Departament', value: `${getDepartmentEmoji(department)} ${getDepartmentName(department)}` },
                { name: '❌ Respins de', value: `<@${user.id}>` }
            )
            .setFooter({ text: '🎮 EUGVRP România', iconURL: guild.iconURL() })
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        // Notificare utilizator
        try {
            const applicant = await guild.members.fetch(applicantId).catch(() => null);
            if (applicant) {
                await applicant.send(`❌ **Ne pare rău!** Aplicația ta pentru **${getDepartmentName(department)}** a fost respinsă. Poți încerca din nou în viitor!`);
            }
        } catch (e) {
            // Nu putem trimite DM
        }

        return;
    }

    // BUTON ÎNCHIDE TICKET
    if (customId.startsWith('close_ticket_')) {
        const ticketUserId = customId.replace('close_ticket_', '');
        const ticket = ticketsMap.get(ticketUserId);

        if (!ticket) {
            return interaction.reply({
                content: '❌ **Ticket-ul nu există.**',
                flags: MessageFlags.Ephemeral
            });
        }

        const ticketChannel = guild.channels.cache.get(ticket.channelId);
        if (ticketChannel) {
            await ticketChannel.delete();
        }

        ticketsMap.delete(ticketUserId);

        // Verificare dacă interaction.reply a fost deja apelat
        try {
            return interaction.reply({
                content: '✅ **Ticket-ul a fost închis.**',
                flags: MessageFlags.Ephemeral
            });
        } catch (e) {
            // Interaction already replied/deferred
        }
    }
}

// Funcție pentru actualizarea embed-ului de vot în timp real
async function updateVoteEmbed(guild, voteData, voteId) {
    try {
        const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
        if (!sesiuneChannel || !voteData.messageId) return;

        const message = await sesiuneChannel.messages.fetch(voteData.messageId).catch(() => null);
        if (!message) return;

        const totalVotes = voteData.da.length + voteData.nu.length;
        const daPercent = totalVotes > 0 ? Math.round((voteData.da.length / totalVotes) * 100) : 0;
        const nuPercent = totalVotes > 0 ? Math.round((voteData.nu.length / totalVotes) * 100) : 0;

        // Creare bară de progres vizuală
        const progressBarLength = 10;
        const daFilled = Math.round((daPercent / 100) * progressBarLength);
        const nuFilled = Math.round((nuPercent / 100) * progressBarLength);
        const daBar = '🟩'.repeat(daFilled) + '⬜'.repeat(progressBarLength - daFilled);
        const nuBar = '🟥'.repeat(nuFilled) + '⬜'.repeat(progressBarLength - nuFilled);

        const updatedEmbed = new EmbedBuilder()
            .setTitle('🗳️ ═══════ VOT SESIUNE ROLEPLAY ═══════')
            .setDescription(`
╔══════════════════════════════════════╗
   🎮 **O NOUĂ SESIUNE SE PREGĂTEȘTE!**
╚══════════════════════════════════════╝

📢 **Atenție, jucători!**
Un Session Host dorește să pornească o sesiune de roleplay!

🤔 **Ești pregătit să intri în joc?**
Votează mai jos pentru a ne spune părerea ta!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            `)
            .setColor(CONFIG.colors.vote)
            .addFields(
                { name: '✅ DA - Sunt pregătit!', value: `\`\`\`\n🟢 ${voteData.da.length} voturi (${daPercent}%)\n${daBar}\n\`\`\``, inline: true },
                { name: '❌ NU - Nu acum', value: `\`\`\`\n🔴 ${voteData.nu.length} voturi (${nuPercent}%)\n${nuBar}\n\`\`\``, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '📊 Total Participanți', value: `\`\`\`\n👥 ${totalVotes} persoane\n\`\`\``, inline: true },
                { name: '👑 Inițiat de', value: `<@${voteData.createdBy}>`, inline: true },
                { name: '⏰ Actualizat', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: '🎮 EUGVRP România • Sistem de Votare | Votul este anonim pentru ceilalți jucători', iconURL: guild.iconURL() })
            .setTimestamp()
            .setThumbnail(guild.iconURL({ size: 128 }));

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`vote_da_${voteId}`)
                    .setLabel(`✅ DA (${voteData.da.length})`)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎮'),
                new ButtonBuilder()
                    .setCustomId(`vote_nu_${voteId}`)
                    .setLabel(`❌ NU (${voteData.nu.length})`)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏸️'),
                new ButtonBuilder()
                    .setCustomId(`vote_results_${voteId}`)
                    .setLabel('📋 Vezi cine a votat')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👀')
            );

        await message.edit({ embeds: [updatedEmbed], components: [row] });
    } catch (error) {
        console.error('Eroare la actualizarea votului:', error);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLER MODAL
// ═══════════════════════════════════════════════════════════════════════════════

async function handleModal(interaction) {
    // Placeholder pentru modal-uri viitoare
}

// ═══════════════════════════════════════════════════════════════════════════════
// PORNIRE BOT
// ═══════════════════════════════════════════════════════════════════════════════

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Eroare la conectare:', error);
    process.exit(1);
});

// Gestionare erori neprinse
process.on('unhandledRejection', error => {
    console.error('❌ Eroare neprinsă:', error);
});

process.on('uncaughtException', error => {
    console.error('❌ Excepție neprinsă:', error);
});
