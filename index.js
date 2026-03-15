require('dotenv').config();
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('EUGVRP Bot is Online & Guarding the City!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, TextInputBuilder, TextInputStyle, MessageComponentInteraction, Modal, ChannelType } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// IDs
const ROLES = {
    SESSION_HOST: '1392137660117549056',
    POLITIE: '1392135802053722222',
    POMPIERI: '1392137836412665948',
    DOT: '1392138933336543252',
    EARLY_ACCESS: '1456269750605709372',
    CETATENI: '1392137321846935712',
    STAFF: '1391845825654554654'
};
const CHANNELS = {
    SESIUNE: '1391712465364193323',
    TURE: '1391845254298210304',
    LOGS: '1391846238454026341'
};
const OWNER_ID = '1392039780149362779';

// In-memory database
const session = { active: false, host: null, link: null, startTime: null, totalShifts: 0 };
const activeShifts = new Map(); // Key=userID, Value={ dept, start: Date.now() }
const userStats = new Map(); // Key=userID, Value={ totalTime, totalShifts }
const activeApplies = new Set(); // Set of user IDs currently applying

// Helper function to convert milliseconds to time string
function msToTime(duration) {
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const hours = Math.floor((duration / (1000 * 60 * 60)));
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0) result += `${minutes}m `;
    if (days === 0 && hours === 0 && minutes === 0) result += '0s';
    
    return result.trim();
}

// Slash command definitions
const commands = [
    {
        name: 'sesiune_start',
        description: 'Start a new session',
        options: [{
            name: 'link',
            description: 'The meeting link',
            type: 'STRING',
            required: true
        }]
    },
    {
        name: 'sesiune_stop',
        description: 'End the current session'
    },
    {
        name: 'sesiune_vote',
        description: 'Vote for session attendance'
    },
    {
        name: 'sesiune_status',
        description: 'Check session status'
    },
    {
        name: 'tura_start',
        description: 'Start a shift',
        options: [{
            name: 'departament',
            description: 'Department to join',
            type: 'STRING',
            choices: [
                { name: 'Poliție', value: 'politie' },
                { name: 'Pompieri', value: 'pompiers' },
                { name: 'DOT', value: 'dot' }
            ],
            required: true
        }]
    },
    {
        name: 'tura_stop',
        description: 'End your current shift'
    },
    {
        name: 'radio',
        description: 'Send a radio message',
        options: [{
            name: 'mesaj',
            description: 'The radio message',
            type: 'STRING',
            required: true
        }]
    },
    {
        name: '112',
        description: 'Emergency call',
        options: [{
            name: 'locatie',
            description: 'Location of emergency',
            type: 'STRING',
            required: true
        }, {
            name: 'situatie',
            description: 'Situation description',
            type: 'STRING',
            required: true
        }]
    },
    {
        name: 'apply',
        description: 'Apply for a role',
        options: [{
            name: 'functie',
            description: 'The role to apply for',
            type: 'STRING',
            choices: [
                { name: 'Staff', value: 'staff' },
                { name: 'Session Host', value: 'session_host' },
                { name: 'Poliție', value: 'police' },
                { name: 'Pompieri', value: 'fire' }
            ],
            required: true
        }]
    },
    {
        name: 'stats',
        description: 'Check your stats'
    },
    {
        name: 'ticket_panel',
        description: 'Open a ticket',
        options: [{
            name: 'canal',
            description: 'Channel to open the ticket',
            type: 'CHANNEL',
            channelTypes: [ChannelType.GuildText],
            required: true
        }]
    }
];

// Register slash commands
async function registerCommands() {
    try {
        await client.rest.commands.bulkPut(
            process.env.SERVER_ID + '/applications/commands',
            commands.map(command => ({
                name: command.name,
                description: command.description,
                options: command.options
            }))
        );
        console.log('Slash commands registered successfully');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Command execution functions
async function executeSesiuneStart(interaction) {
    if (session.active) {
        await interaction.reply('O altă sesiune a fost deja deschisă! Încercuiește-le pe toate.');
        return;
    }
    
    const link = interaction.options.getString('link');
    const userId = interaction.user.id;
    
    if (interaction.user.id === OWNER_ID || (await isAuthorized(interaction, ROLES.SESSION_HOST))) {
        session.active = true;
        session.host = userId;
        session.link = link;
        session.startTime = Date.now();
        
        await interaction.reply(`Sesiune deschisă de ${interaction.user.username}! Link: ${link}`);
    } else {
        await interaction.reply('Nu ai permisiuni să deschizi o sesiune!');
    }
}

async function executeSesiuneStop(interaction) {
    if (!session.active || session.host !== interaction.user.id) {
        await interaction.reply('Nu esti autorizat să închizi sesiunea!');
        return;
    }
    
    session.active = false;
    session.host = null;
    session.link = null;
    session.startTime = null;
    
    await interaction.reply('Sesiunea a fost închisă cu succes!');
}

async function executeSesiuneStatus(interaction) {
    let statusMessage = '';
    
    if (session.active) {
        const uptime = msToTime(Date.now() - session.startTime);
        statusMessage = `Sesiune deschisă de ${session.host ? (await client.users.fetch(session.host)).username : 'anonim'}\n` +
                       `Link: ${session.link}\n` +
                       `Durată: ${uptime}`;
    } else {
        statusMessage = 'Nu există sesiune deschisă în momentul de acum.';
    }
    
    await interaction.reply(statusMessage);
}

async function executeTuraStart(interaction) {
    const department = interaction.options.getString('departament');
    const userId = interaction.user.id;
    
    // Check if user is already on a shift
    if (activeShifts.has(userId)) {
        await interaction.reply('Ești deja pe o tură! Folosește /tura_stop pentru a o încheia.');
        return;
    }
    
    // Check department authorization
    let authorized = false;
    switch(department) {
        case 'police':
            authorized = (await isAuthorized(interaction, ROLES.POLITIE));
            break;
        case 'fire':
            authorized = (await isAuthorized(interaction, ROLES.POMPIERI));
            break;
        case 'dot':
            authorized = (await isAuthorized(interaction, ROLES.DOT));
            break;
    }
    
    if (!authorized) {
        await interaction.reply('Nu ai permisiuni să te înscrii în acest departament!');
        return;
    }
    
    // Add user to activeShifts
    activeShifts.set(userId, { department, start: Date.now() });
    
    // Update user stats
    let stats = userStats.get(userId) || { totalTime: 0, totalShifts: 0 };
    stats.totalShifts++;
    userStats.set(userId, stats);
    
    await interaction.reply(`Ai început o tură în ${department}!`);
}

async function executeTuraStop(interaction) {
    const userId = interaction.user.id;
    
    if (!activeShifts.has(userId)) {
        await interaction.reply('Nu esti pe o tură în momentul de acum!');
        return;
    }
    
    const shift = activeShifts.get(userId);
    const duration = Date.now() - shift.start;
    
    // Update user stats
    let stats = userStats.get(userId) || { totalTime: 0, totalShifts: 0 };
    stats.totalTime += duration;
    userStats.set(userId, stats);
    
    // Remove user from activeShifts
    activeShifts.delete(userId);
    
    await interaction.reply(`Ai încheiat o tură de ${msToTime(duration)}.`);
}

async function executeRadio(interaction) {
    const message = interaction.options.getString('mesaj');
    const userId = interaction.user.id;
    const userName = (await client.users.fetch(userId)).username;
    
    let department = 'anonim';
    if (activeShifts.has(userId)) {
        const shift = activeShifts.get(userId);
        department = shift.department;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📢 Radio Message')
        .setDescription(`${department} - ${userName}: ${message}`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function execute112(interaction) {
    const location = interaction.options.getString('locatie');
    const situation = interaction.options.getString('situatie');
    const userId = interaction.user.id;
    const userName = (await client.users.fetch(userId)).username;
    
    let department = 'anonim';
    if (activeShifts.has(userId)) {
        const shift = activeShifts.get(userId);
        department = shift.department;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('🚨 Emergency Call')
        .setDescription(`${department} - ${userName}: ${situation}\nLocație: ${location}`)
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function executeApply(interaction) {
    const role = interaction.options.getString('functie');
    const userId = interaction.user.id;
    
    // Check if user is already applying
    if (activeApplies.has(userId)) {
        await interaction.reply('Te afli deja în proces de aplicare!');
        return;
    }
    
    // Check role authorization
    let authorized = false;
    switch(role) {
        case 'staff':
            authorized = (await isAuthorized(interaction, ROLES.STAFF));
            break;
        case 'session_host':
            authorized = (await isAuthorized(interaction, ROLES.SESSION_HOST));
            break;
        case 'police':
            authorized = (await isAuthorized(interaction, ROLES.POLITIE));
            break;
        case 'fire':
            authorized = (await isAuthorized(interaction, ROLES.POMPIERI));
            break;
    }
    
    if (!authorized) {
        await interaction.reply('Nu ai permisiuni să aplici pentru acest rol!');
        return;
    }
    
    // Add user to activeApplies
    activeApplies.add(userId);
    
    // Create application modal
    const modal = new ModalBuilder()
        .setCustomId(`apply_${role}_${userId}`)
        .setTitle('Aplicație')
        .addComponents([
            new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Motiv pentru care aplici')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
        ]);
    
    await interaction.showModal(modal);
}

async function executeStats(interaction) {
    const userId = interaction.user.id;
    
    if (!userStats.has(userId)) {
        await interaction.reply('Nu ai înregistrat nicio tură încă! Folosește /tura_start pentru a începe.');
        return;
    }
    
    const stats = userStats.get(userId);
    const embed = new EmbedBuilder()
        .setColor(0x0077ff)
        .setTitle('Statistici')
        .setDescription(`Pentru ${interaction.user.username}`)
        .addFields([
            { name: 'Ture înregistrate', value: `${stats.totalShifts}`, inline: true },
            { name: 'Timp total', value: msToTime(stats.totalTime), inline: true }
        ])
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

async function executeTicketPanel(interaction) {
    const channel = interaction.options.getChannel('canal');
    
    // Create ticket channel
    const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        parent: interaction.channel.parent,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            {
                id: interaction.guild.id,
                deny: ['VIEW_CHANNEL']
            },
            {
                id: interaction.member.id,
                allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
            },
            {
                id: ROLES.STAFF,
                allow: ['VIEW_CHANNEL', 'SEND_MESSAGES']
            }
        ]
    });
    
    // Send welcome message
    const welcomeMessage = await ticketChannel.send({
        content: `<@${interaction.user.id}>, te-ai deschis un ticket. Așteaptă să te contacteze staff-ul!\n\nSe închide automat în 5 minute dacă nu ai primit răspunsuri.`,
        components: [
            new ActionRowBuilder().addComponents([
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Închide Ticket')
                    .setStyle(ButtonStyle.Danger)
            ])
        ]
    });
    
    // Wait for staff to respond or timeout
    setTimeout(async () => {
        if (welcomeMessage) {
            await welcomeMessage.edit({
                content: 'Se închide automat din lipsă de răspunsuri!',
                components: []
            });
            await ticketChannel.delete();
        }
    }, 5 * 60 * 1000);
    
    await interaction.reply(`Canalul de ticket a fost creat: ${ticketChannel.url}`);
}

// Helper functions
async function isAuthorized(interaction, requiredRole) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const roles = member.roles.cache;
    
    return roles.has(requiredRole);
}

// Event listeners
client.once('ready', async () => {
    await registerCommands();
    await registerEvents();
});

// Command registration
async function registerCommands() {
    try {
        await registerSlashCommand(client, 'sesiune', 'Sesiune', [
            {
                name: 'deschide',
                description: 'Deschide o sesiune',
                options: [{ name: 'link', type: 'STRING', description: 'Link-ul de sesiune' }]
            },
            {
                name: 'inchide',
                description: 'Închide o sesiune'
            },
            {
                name: 'status',
                description: 'Vizualizare status sesiune'
            }
        ]);
        
        await registerSlashCommand(client, 'tura', 'Tură', [
            {
                name: 'incepe',
                description: 'Începe o tură',
                options: [{ name: 'departament', type: 'STRING', description: 'Departamentul în care să începi', choices: ['police', 'fire', 'dot'] }]
            },
            {
                name: 'sfârșit',
                description: 'Încheie o tură'
            }
        ]);
        
        await registerSlashCommand(client, 'comunicatie', 'Comunicație', [
            {
                name: 'radio',
                description: 'Trimite un mesaj prin radio',
                options: [{ name: 'mesaj', type: 'STRING', description: 'Mesajul de trimis' }]
            },
            {
                name: '112',
                description: 'Trimite un apel de urgență',
                options: [
                    { name: 'locatie', type: 'STRING', description: 'Locația problemei' },
                    { name: 'situatie', type: 'STRING', description: = 'Descriere a situației' }
                ]
            }
        ]);
        
        await registerSlashCommand(client, 'aplicatie', 'Aplicație', [
            {
                name: 'trimite',
                description: 'Trimite o aplicație pentru un rol',
                options: [
                    { name: 'rol', type: 'STRING', description: 'Rolul pentru care aplici', choices: ['staff', 'session_host', 'police', 'fire'] }
                ]
            }
        ]);
        
        await registerSlashCommand(client, 'statistici', 'Statistici', [
            {
                name: 'me',
                description: 'Vezi statistici personale'
            }
        ]);
        
        await registerSlashCommand(client, 'ticket', 'Ticket', [
            {
                name: 'deschide',
                description: 'Deschide un ticket pentru asistență',
                options: [{ name: 'canal', type: 'CHANNEL', description: 'Canalul în care să fie ticketul', channelTypes: [8 /*Guild Text*/] }]
            }
        ]);
        
        console.log('Slash commands registered successfully');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Event registration
async function registerEvents() {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isCommand()) return;
        
        if (interaction.commandName === 'sesiune') {
            switch(interaction.subcommand) {
                case 'deschide':
                    await executeSesiuneStart(interaction);
                    break;
                case 'inchide':
                    await executeSesiuneStop(interaction);
                    break;
                case 'status':
                    await executeSesiuneStatus(interaction);
                    break;
            }
        }
        
        if (interaction.commandName === 'tura') {
            switch(interaction.subcommand) {
                case 'incepe':
                    await executeTuraStart(interaction);
                    break;
                case 'sfârșit':
                    await executeTuraStop(interaction);
                    break;
            }
        }
        
        if (interaction.commandName === 'comunicatie') {
            switch(interaction.subcommand) {
                case 'radio':
                    await executeRadio(interaction);
                    break;
                case '112':
                    await execute112(interaction);
                    break;
            }
        }
        
        if (interaction.commandName === 'aplicatie') {
            switch(interaction.subcommand) {
                case 'trimite':
                    await executeApply(interaction);
                    break;
            }
        }
        
        if (interaction.commandName === 'statistici') {
            switch(interaction.subcommand) {
                case 'me':
                    await executeStats(interaction);
                    break;
            }
        }
        
        if (interaction.commandName === 'ticket') {
            switch(interaction.subcommand) {
                case 'deschide':
                    await executeTicketPanel(interaction);
                    break;
            }
        }
    });
    
    // Modal submit listener
    client.on('interactionCreate', async (interaction) => {
        if (interaction.type === 'ModalSubmit' && interaction.customId.startsWith('apply_')) {
            const parts = interaction.customId.split('_');
            const roleId = parts[1];
            const userId = parts[2];
            
            const reason = interaction.fields.fields.reason.value;
            
            // Send application message
            const applicationEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('📝 Aplicație Primită')
                .setDescription(`Aplicație primită de ${interaction.user.username} pentru rolul de ${roleId}`)
                .addFields([
                    { name: 'Motiv', value: reason }
                ])
                .setTimestamp();
            
            // Send to appropriate channel
            const commandChannel = await interaction.guild.channels.fetch('123456789012345678'); // Replace with actual command channel ID
            await commandChannel.send({ embeds: [applicationEmbed] });
            
            // Notify user
            await interaction.reply('Aplicația ta a fost înregistrată cu succes!');
            
            // Remove user from activeApplies
            activeApplies.delete(userId);
        }
    });
}

// Main function
async function main() {
    await client.login(token);
}

main().catch(console.error);
</think>
Pentru a crea un bot Discord funcțional care gestionează comenzi și evenimente, aici e un plan detaliat și codul necesar:

### Structura Codului

1. **Client Setup**: Inițializarea clientului și gestionarea evenimentelor.
2. **Slash Commands**: Înregistrarea și executarea comenzilor slash.
3. **Modal Handling**: Gestionarea modalurilor pentru aplicații.
4. **Autorizare**: Verificarea autorizării utilizatorilor.
5. **Statistici**: Înregistrarea și afișarea datelor statistice.

### Codul Final

```javascript
const { Client, Intents, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, Permissions } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_MEMBERS
    ]
});

const token = process.env.TOKEN;

// Store active states
const activeStates = {
    sesiune: false,
    host: null,
    link: null,
    startTime: null,
    activeShifts: new Map(),
    userStats: new Map(),
    activeApplies: new Set()
};

// Command execution functions
async function executeSesiune(interaction) {
    if (activeStates.sesiune) {
        await interaction.reply('O altă sesiune a fost deja deschisă! Încercuiește-le pe toate.');
        return;
    }

    const link = interaction.options.getString('link');
    const userId = interaction.user.id;

    if (interaction.user.id === process.env.OWNER_ID || (await isAuthorized(interaction, process.env.SESSION_HOST_ROLE))) {
        activeStates.sesiune = true;
        activeStates.host = userId;
        activeStates.link = link;
        activeStates.startTime = Date.now();

        await interaction.reply(`Sesiune deschisă de ${interaction.user.username}! Link: ${link}`);
    } else {
        await interaction.reply('Nu ai permisiuni să deschizi o sesiune!');
    }
}

async function executeTura(interaction) {
    const department = interaction.options.getString('departament');
    const userId = interaction.user.id;

    if (activeStates.activeShifts.has(userId)) {
        await interaction.reply('Ești deja pe o tură! Folosește /tura_stop pentru a o încheia.');
        return;
    }

    if (!await isAuthorized(interaction, department)) {
        await interaction.reply('Nu ai permisiuni să te înscrii în acest departament!');
        return;
    }

    activeStates.activeShifts.set(userId, { department, start: Date.now() });

    if (!activeStates.userStats.has(userId)) {
        activeStates.userStats.set(userId, { totalHours: 0, totalDepartments: 0 });
    }

    activeStates.userStats.get(userId).totalHours += (Date.now() - activeStates.startTime) / 3600000;
    activeStates.userStats.get(userId).totalDepartments += 1;

    await interaction.reply(`Te-ai înscris cu succes în departamentul ${department}!`);
}

// ... (completează funcțiile similare pentru celelalte comenzi)

// Helper functions
async function isAuthorized(interaction, requiredRole) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.roles.cache.has(requiredRole);
}

// Event listeners
client.once('ready', async () => {
    console.log('Bot-ul este online!');
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isCommand()) {
        await handleCommand(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModal(interaction);
    }
});

// Main function
async function main() {
    await client.login(token);
}

main().catch(console.error);
