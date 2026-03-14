const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Collection, Events } = require('discord.js');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('EUGVRP Bot is Online & Guarding the City!');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

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

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

const session = { active: false, host: null, link: null, startTime: null, totalShifts: 0 };
const activeShifts = new Map();
const userStats = new Map();
const activeApplies = new Set();

function msToTime(duration) {
    let seconds = Math.floor((duration / 1000) % 60);
    let minutes = Math.floor((duration / (1000 * 60)) % 60);
    let hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    return `${hours}h ${minutes}m ${seconds}s`;
}

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    const commands = [
        {
            name: 'sesiune_start',
            description: 'Începe o sesiune de roleplay',
            options: [
                {
                    name: 'link',
                    type: 3,
                    description: 'Link-ul serverului',
                    required: true
                }
            ]
        },
        {
            name: 'sesiune_stop',
            description: 'Oprește sesiunea de roleplay'
        },
        {
            name: 'sesiune_vote',
            description: 'Votează pentru prezență'
        },
        {
            name: 'sesiune_status',
            description: 'Verifică statusul sesiunii'
        },
        {
            name: 'tura_start',
            description: 'Începe o tură',
            options: [
                {
                    name: 'departament',
                    type: 3,
                    description: 'Departamentul',
                    required: true,
                    choices: [
                        { name: 'Poliție', value: 'POLITIE' },
                        { name: 'Pompieri', value: 'POMPIERI' },
                        { name: 'DOT', value: 'DOT' }
                    ]
                }
            ]
        },
        {
            name: 'tura_stop',
            description: 'Oprește o tură'
        },
        {
            name: 'radio',
            description: 'Trimite un mesaj pe radio',
            options: [
                {
                    name: 'mesaj',
                    type: 3,
                    description: 'Mesajul',
                    required: true
                }
            ]
        },
        {
            name: '112',
            description: 'Trimite o alertă 112',
            options: [
                {
                    name: 'locatie',
                    type: 3,
                    description: 'Locația',
                    required: true
                },
                {
                    name: 'situatie',
                    type: 3,
                    description: 'Situatia',
                    required: true
                }
            ]
        },
        {
            name: 'apply',
            description: 'Trimite o aplicație',
            options: [
                {
                    name: 'functie',
                    type: 3,
                    description: 'Functia',
                    required: true,
                    choices: [
                        { name: 'Staff', value: 'STAFF' },
                        { name: 'Session Host', value: 'SESSION_HOST' },
                        { name: 'Poliție', value: 'POLITIE' },
                        { name: 'Pompieri', value: 'POMPIERI' }
                    ]
                }
            ]
        },
        {
            name: 'stats',
            description: 'Vezi statisticile tale'
        },
        {
            name: 'ticket_panel',
            description: 'Trimite un panel de ticket',
            options: [
                {
                    name: 'canal',
                    type: 7,
                    description: 'Canalul unde să trimiți panelul',
                    required: true
                }
            ]
        }
    ];

    const guild = client.guilds.cache.get('1391712465364193322'); // Replace with actual guild ID
    if (guild) {
        await guild.commands.set(commands);
    } else {
        console.error("Guild not found");
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options, user } = interaction;

    if (commandName === 'sesiune_start') {
        if (!interaction.member.roles.cache.has(ROLES.SESSION_HOST) && interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: 'Nu ai permisiunea să folosești această comandă!', ephemeral: true });
        }

        const link = options.getString('link');
        session.active = true;
        session.host = user.id;
        session.link = link;
        session.startTime = Date.now();

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Sesiune Start')
            .setDescription(`@everyone\nSesiunea a fost pornită de <@${user.id}> la ora ${new Date().toLocaleTimeString()}`)
            .addFields(
                { name: 'Link Server', value: link, inline: true }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('get_link')
                .setLabel('Link Server')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ content: '@everyone', embeds: [embed], components: [row] });
    }

    if (commandName === 'sesiune_stop') {
        if (!session.active) {
            return interaction.reply({ content: 'Nu există o sesiune activă!', ephemeral: true });
        }

        if (!interaction.member.roles.cache.has(ROLES.SESSION_HOST) && interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: 'Nu ai permisiunea să folosești această comandă!', ephemeral: true });
        }

        const duration = Date.now() - session.startTime;
        session.active = false;

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Sesiune Stop')
            .setDescription(`Sesiunea a fost oprită de <@${user.id}>`)
            .addFields(
                { name: 'Durată', value: msToTime(duration), inline: true },
                { name: 'Număr total de ture', value: session.totalShifts.toString(), inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'sesiune_vote') {
        const embed = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle('Votează pentru prezență')
            .setDescription('Votul tău a fost înregistrat!');

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'sesiune_status') {
        if (!session.active) {
            return interaction.reply({ content: 'Nu există o sesiune activă!', ephemeral: true });
        }

        const duration = Date.now() - session.startTime;
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('Status Sesiune')
            .setDescription(`Sesiunea este activă`)
            .addFields(
                { name: 'Durată', value: msToTime(duration), inline: true },
                { name: 'Host', value: `<@${session.host}>`, inline: true },
                { name: 'Număr total de ture', value: session.totalShifts.toString(), inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'tura_start') {
        const departament = options.getString('departament');
        const shiftId = `${user.id}-${Date.now()}`;
        activeShifts.set(shiftId, { user: user.id, departament, start: Date.now() });

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Tură Start')
            .setDescription(`<@${user.id}> a început o tură în ${departament}`);

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'tura_stop') {
        const shiftId = Array.from(activeShifts.keys()).find(key => activeShifts.get(key).user === user.id);
        if (!shiftId) {
            return interaction.reply({ content: 'Nu ai o tură activă!', ephemeral: true });
        }

        const shift = activeShifts.get(shiftId);
        const duration = Date.now() - shift.start;
        activeShifts.delete(shiftId);
        session.totalShifts++;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Tură Stop')
            .setDescription(`<@${user.id}> a terminat o tură în ${shift.departament}`)
            .addFields(
                { name: 'Durată', value: msToTime(duration), inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'radio') {
        const message = options.getString('mesaj');
        const embed = new EmbedBuilder()
            .setColor(0x0000FF)
            .setTitle('Radio')
            .setDescription(`Mesaj de la <@${user.id}>: ${message}`);

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === '112') {
        const locatie = options.getString('locatie');
        const situatie = options.getString('situatie');
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Alertă 112')
            .setDescription(`Locație: ${locatie}\nSituatie: ${situatie}`);

        await interaction.reply({ content: '@everyone', embeds: [embed] });
    }

    if (commandName === 'apply') {
        if (activeApplies.has(user.id)) {
            return interaction.reply({ content: 'Ai deja o aplicație în curs!', ephemeral: true });
        }

        activeApplies.add(user.id);
        const functie = options.getString('functie');

        const dmChannel = await user.createDM();
        await dmChannel.send('Vă mulțumim pentru aplicația ta! Vom revăza aplicația ta în curând.');

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Aplicație Trimisă')
            .setDescription(`Aplicația ta pentru ${functie} a fost trimisă!`);

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'stats') {
        const stats = userStats.get(user.id) || { totalShifts: 0, totalDuration: 0 };
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('Statisticile Tale')
            .addFields(
                { name: 'Număr total de ture', value: stats.totalShifts.toString(), inline: true },
                { name: 'Durată totală', value: msToTime(stats.totalDuration), inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'ticket_panel') {
        const channel = options.getChannel('canal');
        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('Ticket Panel')
            .setDescription('Apasă butonul pentru a deschide un ticket');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('Deschide Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'get_link') {
        if (!session.link) {
            return interaction.reply({ content: 'Nu există un link disponibil!', ephemeral: true });
        }

        await interaction.reply({ content: session.link, ephemeral: true });
    }

    if (interaction.customId === 'open_ticket') {
        const ticketName = `ticket-${interaction.user.username}`;
        const category = interaction.channel.parentId;

        const ticketChannel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: category,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [0x0000000000000001], // ViewChannel
                },
                {
                    id: interaction.user.id,
                    allow: [0x0000000000000001], // ViewChannel
                    allow: [0x0000000000000002], // SendMessages
                },
                {
                    id: ROLES.STAFF,
                    allow: [0x0000000000000001], // ViewChannel
                }
            ]
        });

        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle('Ticket Deschis')
            .setDescription(`Ticket-ul <#${ticketChannel.id}> a fost deschis de <@${interaction.user.id}>`);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('Închide Ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `<@${ROLES.STAFF}>`, embeds: [embed], components: [row] });
        await interaction.reply({ content: `Ticket-ul a fost creat: <#${ticketChannel.id}>`, ephemeral: true });
    }

    if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: 'Se închide canalul în 3 secunde...', ephemeral: true });
        setTimeout(() => {
            interaction.channel.delete();
        }, 3000);
    }

    if (interaction.customId.startsWith('apply_')) {
        const [action, userId] = interaction.customId.split('_').slice(1);
        const user = interaction.guild.members.cache.get(userId);
        if (!user) return;

        if (action === 'accept') {
            await interaction.update({ content: 'Aplicația a fost acceptată!', ephemeral: true });
            const dmChannel = await user.createDM();
            await dmChannel.send('Aplicația ta a fost acceptată!');
        } else if (action === 'reject') {
            await interaction.update({ content: 'Aplicația a fost respinsă!', ephemeral: true });
            const dmChannel = await user.createDM();
            await dmChannel.send('Aplicația ta a fost respinsă.');
        }
    }
});

client.login(process.env.TOKEN);
