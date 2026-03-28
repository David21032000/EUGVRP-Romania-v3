const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
        apply: 0x9933ff
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
        .setDescription('Pornește o sesiune roleplay')
        .addStringOption(option =>
            option.setName('link')
                .setDescription('Link-ul serverului Roblox')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('sesiune_stop')
        .setDescription('Oprește sesiunea roleplay activă'),

    new SlashCommandBuilder()
        .setName('sesiune_status')
        .setDescription('Afișează statusul sesiunii curente'),

    new SlashCommandBuilder()
        .setName('sesiune_vote')
        .setDescription('Pornește un vot pentru sesiune'),

    // SISTEM TURE
    new SlashCommandBuilder()
        .setName('tura_start')
        .setDescription('Începe o tură în departamentul tău'),

    new SlashCommandBuilder()
        .setName('tura_stop')
        .setDescription('Oprește tura ta activă'),

    new SlashCommandBuilder()
        .setName('tura_status')
        .setDescription('Afișează statusul turei tale'),

    // SISTEM RADIO
    new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Trimite un mesaj radio')
        .addStringOption(option =>
            option.setName('mesaj')
                .setDescription('Mesajul de trimis pe radio')
                .setRequired(true)),

    // SISTEM DISPECERAT 112
    new SlashCommandBuilder()
        .setName('112')
        .setDescription('Trimite un apel de urgență 112')
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
        .setDescription('🚨 Buton panică - ofițer în pericol'),

    // STATISTICI
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Afișează statisticile tale')
        .addUserOption(option =>
            option.setName('utilizator')
                .setDescription('Utilizatorul pentru care afișezi statisticile')
                .setRequired(false)),

    // LEADERBOARD
    new SlashCommandBuilder()
        .setName('top_ture')
        .setDescription('Afișează top 10 membri cu cele mai multe ore'),

    // APLICAȚII
    new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Aplică pentru un departament')
        .addStringOption(option =>
            option.setName('departament')
                .setDescription('Departamentul pentru care aplici')
                .setRequired(true)
                .addChoices(
                    { name: 'Poliție', value: 'politie' },
                    { name: 'Pompieri', value: 'pompieri' },
                    { name: 'DOT', value: 'dot' }
                )),

    // TICKETS
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Creează un ticket de suport')
        .addStringOption(option =>
            option.setName('motiv')
                .setDescription('Motivul ticketului')
                .setRequired(true))
];

// ═══════════════════════════════════════════════════════════════════════════════
// EVENIMENTE CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} este conectat!`);

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
    const { commandName, guild, member, user } = interaction;

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
            content: '❌ Doar membrii cu rolul **Session Host** pot porni sesiuni.',
            ephemeral: true
        });
    }

    // Verificare dacă există deja o sesiune activă
    if (sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ Există deja o sesiune activă!',
            ephemeral: true
        });
    }

    const link = interaction.options.getString('link');
    const startTime = Date.now();

    // Salvare sesiune în Map
    sessionsMap.set('active', {
        startedBy: user.id,
        startedByTag: user.tag,
        link: link,
        startTime: startTime,
        shiftsCount: 0
    });

    // Creare embed
    const embed = new EmbedBuilder()
        .setTitle('🎮 SESIUNE ROLEPLAY ACTIVĂ')
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👤 Pornit de', value: `<@${user.id}>`, inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(startTime / 1000)}:F>`, inline: true },
            { name: '📊 Status', value: '🟢 ACTIV', inline: true },
            { name: '👥 Membri în tură', value: '0', inline: true }
        )
        .setImage(link)
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    // Buton pentru intrare pe server
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('join_server')
                .setLabel('🎮 Intră pe serverul Roblox')
                .setStyle(ButtonStyle.Success)
        );

    // Trimitere în canalul de sesiune
    const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
    if (sesiuneChannel) {
        const message = await sesiuneChannel.send({
            content: `<@&${CONFIG.roles.cetateni}> @everyone @here`,
            embeds: [embed],
            components: [row]
        });
        sessionsMap.get('active').messageId = message.id;
    }

    // Răspuns ephemeral
    await interaction.reply({
        content: '✅ Sesiunea a fost pornită cu succes!',
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Sesiune pornită')
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👤 Host', value: `<@${user.id}> (${user.tag})` },
            { name: '🕐 Ora', value: `<t:${Math.floor(startTime / 1000)}:F>` }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleSesiuneStop(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ Doar membrii cu rolul **Session Host** pot opri sesiuni.',
            ephemeral: true
        });
    }

    // Verificare dacă există sesiune activă
    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ Nu există nicio sesiune activă!',
            ephemeral: true
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
        .setTitle('📊 RAPORT FINAL SESIUNE')
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👤 Oprit de', value: `<@${user.id}>`, inline: true },
            { name: '⏱️ Durata', value: formatDuration(duration), inline: true },
            { name: '👥 Membri activi', value: `${activeShifts.length}`, inline: true },
            { name: '🚔 Ture totale', value: `${session.shiftsCount}`, inline: true }
        )
        .setFooter({ text: 'EUGVRP România' })
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
        content: '✅ Sesiunea a fost oprită! Vezi raportul în canalul de sesiune.',
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Sesiune oprită')
        .setColor(CONFIG.colors.warning)
        .addFields(
            { name: '👤 Oprit de', value: `<@${user.id}> (${user.tag})` },
            { name: '⏱️ Durată', value: formatDuration(duration) }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleSesiuneStatus(interaction) {
    const { guild } = interaction;

    if (!sessionsMap.has('active')) {
        return interaction.reply({
            content: '❌ Nu există nicio sesiune activă.',
            ephemeral: true
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
        .setTitle('📊 STATUS SESIUNE')
        .setColor(CONFIG.colors.session)
        .addFields(
            { name: '👤 Host', value: `<@${session.startedBy}>`, inline: true },
            { name: '🕐 Start', value: `<t:${Math.floor(session.startTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată', value: formatDuration(duration), inline: true },
            { name: '📊 Status', value: '🟢 ACTIV', inline: true },
            { name: '👥 În tură', value: `${activeShifts.length}`, inline: true },
            { name: '🚔 Ture totale', value: `${session.shiftsCount}`, inline: true }
        )
        .setFooter({ text: 'EUGVRP România' })
        .setTimestamp();

    await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
}

async function handleSesiuneVote(interaction) {
    const { guild, member, user } = interaction;

    // Verificare rol Session Host
    if (!hasRole(member, CONFIG.roles.sessionHost)) {
        return interaction.reply({
            content: '❌ Doar membrii cu rolul **Session Host** pot porni voturi.',
            ephemeral: true
        });
    }

    // Creare embed pentru vot
    const voteEmbed = new EmbedBuilder()
        .setTitle('🗳️ VOT SESIUNE ROLEPLAY')
        .setDescription('O sesiune roleplay se pregătește. Votează mai jos!')
        .setColor(CONFIG.colors.warning)
        .addFields(
            { name: '✅ DA', value: '0 voturi', inline: true },
            { name: '❌ NU', value: '0 voturi', inline: true }
        )
        .setFooter({ text: 'EUGVRP România' })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('vote_da')
                .setLabel('✅ Votează DA')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('vote_nu')
                .setLabel('❌ Votează NU')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('vote_results')
                .setLabel('📊 Vezi voturi')
                .setStyle(ButtonStyle.Secondary)
        );

    // Initialize vote tracking
    const voteId = `vote_${Date.now()}`;
    votesMap.set(voteId, {
        da: [],
        nu: [],
        createdBy: user.id
    });

    // Trimitere în canalul de sesiune
    const sesiuneChannel = guild.channels.cache.get(CONFIG.channels.sesiune);
    if (sesiuneChannel) {
        await sesiuneChannel.send({
            content: `<@&${CONFIG.roles.cetateni}> @everyone @here`,
            embeds: [voteEmbed],
            components: [row]
        });
    }

    await interaction.reply({
        content: '✅ Votul a fost pornit!',
        ephemeral: true
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
            content: '❌ Nu există nicio sesiune activă! Nu poți începe o tură fără sesiune.',
            ephemeral: true
        });
    }

    // Verificare roluri permise
    const allowedRoles = [CONFIG.roles.politie, CONFIG.roles.pompieri, CONFIG.roles.dot];
    if (!hasAnyRole(member, allowedRoles)) {
        return interaction.reply({
            content: '❌ Numele tău nu are rolul necesar pentru a începe această tură. Dacă vrei să faci parte din această facțiune, te rugăm să aplici folosind `/apply`.',
            ephemeral: true
        });
    }

    // Verificare dacă are deja o tură activă
    if (shiftsMap.has(user.id) && shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ Ai deja o tură activă! Folosește `/tura_stop` pentru a o opri.',
            ephemeral: true
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
        .setTitle('🚔 TURĂ ÎNCEPUTĂ')
        .setColor(getDepartmentColor(department))
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(startTime / 1000)}:F>`, inline: true }
        )
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: `✅ Tură începută pentru departamentul **${getDepartmentName(department)}**!`,
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Tură pornită')
        .setColor(getDepartmentColor(department))
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
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
            content: '❌ Nu ai nicio tură activă!',
            ephemeral: true
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
        .setTitle('🏁 TURĂ FINALIZATĂ')
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(shift.startTime / 1000)}:F>`, inline: true },
            { name: '🕐 Ora stop', value: `<t:${Math.floor(endTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată', value: formatDuration(duration), inline: true }
        )
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: `✅ Tură finalizată! Durată: **${formatDuration(duration)}**`,
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Tură oprită')
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: getDepartmentName(shift.department) },
            { name: '⏱️ Durată', value: formatDuration(duration) }
        )
        .setTimestamp();
    await sendLog(guild, logEmbed);
}

async function handleTuraStatus(interaction) {
    const { user } = interaction;

    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ Nu ai nicio tură activă.',
            ephemeral: true
        });
    }

    const shift = shiftsMap.get(user.id);
    const currentTime = Date.now();
    const duration = currentTime - shift.startTime;

    const embed = new EmbedBuilder()
        .setTitle('📊 STATUS TURĂ')
        .setColor(getDepartmentColor(shift.department))
        .addFields(
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '🕐 Ora start', value: `<t:${Math.floor(shift.startTime / 1000)}:F>`, inline: true },
            { name: '⏱️ Durată curentă', value: formatDuration(duration), inline: true },
            { name: '📊 Status', value: '🟢 Activ', inline: true }
        )
        .setFooter({ text: 'EUGVRP România' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEM RADIO
// ═══════════════════════════════════════════════════════════════════════════════

async function handleRadio(interaction) {
    const { guild, user } = interaction;

    // Verificare dacă utilizatorul este în tură
    if (!shiftsMap.has(user.id) || !shiftsMap.get(user.id).active) {
        return interaction.reply({
            content: '❌ Trebuie să fii într-o tură activă pentru a folosi radio!',
            ephemeral: true
        });
    }

    const shift = shiftsMap.get(user.id);
    const mesaj = interaction.options.getString('mesaj');

    // Creare embed radio
    const embed = new EmbedBuilder()
        .setTitle('📡 RADIO DISPATCH')
        .setColor(CONFIG.colors.radio)
        .addFields(
            { name: '👤 De la', value: `<@${user.id}>`, inline: true },
            { name: '🏢 Departament', value: getDepartmentName(shift.department), inline: true },
            { name: '💬 Mesaj', value: mesaj }
        )
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({ embeds: [embed] });
    }

    await interaction.reply({
        content: '✅ Mesaj radio trimis!',
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Radio')
        .setColor(CONFIG.colors.radio)
        .addFields(
            { name: '👤 De la', value: `<@${user.id}> (${user.tag})` },
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
        .setTitle('🚨 112 DISPATCH - APEL DE URGENȚĂ')
        .setColor(CONFIG.colors.emergency)
        .addFields(
            { name: '👤 Apelant', value: `<@${user.id}>`, inline: true },
            { name: '📍 Locație', value: locatie, inline: true },
            { name: '📞 Mesaj', value: mesaj }
        )
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture cu ping la departamente
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({
            content: `<@&${CONFIG.roles.politie}> <@&${CONFIG.roles.pompieri}> <@&${CONFIG.roles.dot}>`,
            embeds: [embed]
        });
    }

    await interaction.reply({
        content: '✅ Apelul de urgență a fost trimis!',
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: Apel 112')
        .setColor(CONFIG.colors.emergency)
        .addFields(
            { name: '👤 Apelant', value: `<@${user.id}> (${user.tag})` },
            { name: '📍 Locație', value: locatie },
            { name: '📞 Mesaj', value: mesaj }
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
            content: '❌ Doar membrii cu rolul **Poliție** pot folosi butonul de panică!',
            ephemeral: true
        });
    }

    // Creare embed panic
    const embed = new EmbedBuilder()
        .setTitle('🚨🚨🚨 OFIȚER ÎN PERICOL 🚨🚨🚨')
        .setColor(CONFIG.colors.panic)
        .addFields(
            { name: '👤 Ofițer', value: `<@${user.id}>`, inline: true },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setDescription('⚠️ **URGENT! Ofițer în pericol! Asistență imediată necesară!**')
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
        .setTimestamp();

    // Trimitere în canalul de ture cu ping
    const tureChannel = guild.channels.cache.get(CONFIG.channels.ture);
    if (tureChannel) {
        await tureChannel.send({
            content: `@everyone 🚨 **PANICĂ** - OFIȚER ÎN PERICOL!`,
            embeds: [embed]
        });
    }

    await interaction.reply({
        content: '✅ Alerta de panică a fost trimisă!',
        ephemeral: true
    });

    // Log
    const logEmbed = new EmbedBuilder()
        .setTitle('📋 LOG: PANIC BUTTON')
        .setColor(CONFIG.colors.panic)
        .addFields(
            { name: '👤 Ofițer', value: `<@${user.id}> (${user.tag})` },
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
        .setTitle('📊 STATISTICI JUCĂTOR')
        .setColor(stats.department ? getDepartmentColor(stats.department) : CONFIG.colors.session)
        .addFields(
            { name: '👤 Utilizator', value: `<@${targetUser.id}>`, inline: true },
            { name: '🏢 Departament', value: stats.department ? getDepartmentName(stats.department) : 'Niciunul', inline: true },
            { name: '📋 Total ture', value: `${stats.totalShifts}`, inline: true },
            { name: '⏱️ Timp total', value: `${hours}h ${minutes}m`, inline: true }
        )
        .setFooter({ text: 'EUGVRP România' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
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
            content: '❌ Nu există încă statistici disponibile.',
            ephemeral: true
        });
    }

    let description = '';
    let position = 1;

    for (const [userId, stats] of sortedStats) {
        const hours = Math.floor(stats.totalMinutes / 60);
        const minutes = stats.totalMinutes % 60;
        const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : `**${position}.**`;
        const departmentEmoji = stats.department === 'politie' ? '🚔' : stats.department === 'pompieri' ? '🚒' : stats.department === 'dot' ? '🛠️' : '👤';

        description += `${medal} <@${userId}> - ${hours}h ${minutes}m ${departmentEmoji}\n`;
        position++;
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 TOP 10 MEMBRI')
        .setColor(CONFIG.colors.session)
        .setDescription(description)
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
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
        .setTitle('📝 APLICAȚIE NOUĂ')
        .setColor(departmentColor)
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '🏢 Departament', value: departmentName },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setFooter({ text: 'EUGVRP România', iconURL: guild.iconURL() })
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
            content: `<@&${CONFIG.roles.sessionHost}>`,
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
        content: '✅ Aplicația ta a fost trimisă către staff! Vei primi un răspuns în curând.',
        ephemeral: true
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
            content: `❌ Ai deja un ticket deschis: <#${existingTicket.channelId}>`,
            ephemeral: true
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
        .setTitle('🎫 TICKET DE SUPORT')
        .setColor(CONFIG.colors.ticket)
        .addFields(
            { name: '👤 Utilizator', value: `<@${user.id}> (${user.tag})` },
            { name: '📝 Motiv', value: motiv },
            { name: '🕐 Ora', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
        )
        .setDescription('Un membru staff vă va ajuta în curând.')
        .setFooter({ text: 'EUGVRP România' })
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
        content: `✅ Ticket-ul tău a fost creat: ${ticketChannel}`,
        ephemeral: true
    });
}

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
                content: '❌ Sesiunea nu este disponibilă pentru tine.',
                ephemeral: true
            });
        }

        if (!sessionsMap.has('active')) {
            return interaction.reply({
                content: '❌ Nu există nicio sesiune activă.',
                ephemeral: true
            });
        }

        const session = sessionsMap.get('active');
        return interaction.reply({
            content: `🎮 **Link server Roblox:**\n${session.link}`,
            ephemeral: true
        });
    }

    // BUTOANE VOT DA
    if (customId === 'vote_da') {
        const voteEntry = Array.from(votesMap.entries()).find(([k, v]) => v.createdBy);
        if (!voteEntry) {
            return interaction.reply({
                content: '❌ Votul nu mai există.',
                ephemeral: true
            });
        }

        const [voteId, voteData] = voteEntry;

        if (voteData.da.includes(user.id)) {
            return interaction.reply({
                content: '❌ Ai votat deja!',
                ephemeral: true
            });
        }

        if (voteData.nu.includes(user.id)) {
            voteData.nu = voteData.nu.filter(id => id !== user.id);
        }

        voteData.da.push(user.id);
        votesMap.set(voteId, voteData);

        return interaction.reply({
            content: '✅ Ai votat **DA**!',
            ephemeral: true
        });
    }

    // BUTOANE VOT NU
    if (customId === 'vote_nu') {
        const voteEntry = Array.from(votesMap.entries()).find(([k, v]) => v.createdBy);
        if (!voteEntry) {
            return interaction.reply({
                content: '❌ Votul nu mai există.',
                ephemeral: true
            });
        }

        const [voteId, voteData] = voteEntry;

        if (voteData.nu.includes(user.id)) {
            return interaction.reply({
                content: '❌ Ai votat deja!',
                ephemeral: true
            });
        }

        if (voteData.da.includes(user.id)) {
            voteData.da = voteData.da.filter(id => id !== user.id);
        }

        voteData.nu.push(user.id);
        votesMap.set(voteId, voteData);

        return interaction.reply({
            content: '✅ Ai votat **NU**!',
            ephemeral: true
        });
    }

    // BUTON VEZI VOTURI
    if (customId === 'vote_results') {
        const voteEntry = Array.from(votesMap.entries()).find(([k, v]) => v.createdBy);
        if (!voteEntry) {
            return interaction.reply({
                content: '❌ Votul nu mai există.',
                ephemeral: true
            });
        }

        const [voteId, voteData] = voteEntry;

        const daList = voteData.da.length > 0 ? voteData.da.map(id => `<@${id}>`).join('\n') : 'Nimeni';
        const nuList = voteData.nu.length > 0 ? voteData.nu.map(id => `<@${id}>`).join('\n') : 'Nimeni';

        const embed = new EmbedBuilder()
            .setTitle('📊 REZULTATE VOT')
            .setColor(CONFIG.colors.warning)
            .addFields(
                { name: `✅ DA (${voteData.da.length})`, value: daList },
                { name: `❌ NU (${voteData.nu.length})`, value: nuList }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // BUTON ACCEPTĂ APLICAȚIE
    if (customId.startsWith('accept_')) {
        if (!hasRole(member, CONFIG.roles.sessionHost)) {
            return interaction.reply({
                content: '❌ Doar Session Host poate accepta aplicații.',
                ephemeral: true
            });
        }

        const parts = customId.split('_');
        const applicantId = parts[1];
        const department = parts[2];
        const applicant = await guild.members.fetch(applicantId).catch(() => null);

        if (!applicant) {
            return interaction.reply({
                content: '❌ Utilizatorul nu mai este pe server.',
                ephemeral: true
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
            .setTitle('✅ APLICAȚIE ACCEPTATĂ')
            .setColor(getDepartmentColor(department))
            .addFields(
                { name: '👤 Utilizator', value: `<@${applicantId}>` },
                { name: '🏢 Departament', value: getDepartmentName(department) },
                { name: '✅ Acceptat de', value: `<@${user.id}>` }
            )
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        // Notificare utilizator
        try {
            await applicant.send(`✅ Felicitări! Aplicația ta pentru **${getDepartmentName(department)}** a fost acceptată!`);
        } catch (e) {
            // Nu putem trimite DM
        }

        return;
    }

    // BUTON RESPINGE APLICAȚIE
    if (customId.startsWith('reject_')) {
        if (!hasRole(member, CONFIG.roles.sessionHost)) {
            return interaction.reply({
                content: '❌ Doar Session Host poate respinge aplicații.',
                ephemeral: true
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
            .setTitle('❌ APLICAȚIE RESPINSĂ')
            .setColor(CONFIG.colors.error)
            .addFields(
                { name: '👤 Utilizator', value: `<@${applicantId}>` },
                { name: '🏢 Departament', value: getDepartmentName(department) },
                { name: '❌ Respins de', value: `<@${user.id}>` }
            )
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });

        // Notificare utilizator
        try {
            const applicant = await guild.members.fetch(applicantId).catch(() => null);
            if (applicant) {
                await applicant.send(`❌ Ne pare rău, aplicația ta pentru **${getDepartmentName(department)}** a fost respinsă.`);
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
                content: '❌ Ticket-ul nu există.',
                ephemeral: true
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
                content: '✅ Ticket-ul a fost închis.',
                ephemeral: true
            });
        } catch (e) {
            // Interaction already replied/deferred
        }
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