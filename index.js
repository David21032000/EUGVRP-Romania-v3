require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const express = require('express');

// ==========================================
// 1. SETĂRI DASHBOARD WEB (EXPRESS)
// ==========================================
const app = express();
const port = process.env.PORT || 3000; // Railway va seta automat portul aici

app.get('/', (req, res) => {
    // Un dashboard HTML simplu pe care îl poți face mai frumos târziu
    res.send(`
        <html>
            <head>
                <title>EUGVRP Music Dashboard</title>
                <style>
                    body { font-family: Arial; background-color: #2b2d31; color: white; text-align: center; padding: 50px; }
                    h1 { color: #5865F2; }
                </style>
            </head>
            <body>
                <h1>🎵 EUGVRP Music este ONLINE!</h1>
                <p>Botul funcționează perfect.</p>
                <p>Pentru a rula o melodie pe server, folosește comanda: <b>!play [numele sau linkul melodiei]</b></p>
            </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`🌐 Dashboard pornit la http://localhost:${port}`);
});

// ==========================================
// 2. SETĂRI DISCORD BOT
// ==========================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // ATENȚIE: Trebuie activat din Discord Developer Portal!
    ]
});

// Inițializăm Player-ul de muzică
const player = new Player(client);

// Încărcăm extractoarele pentru YouTube, Spotify etc.
player.extractors.loadMulti(DefaultExtractors);

// Eveniment: Când botul se conectează
client.on('ready', () => {
    console.log(`🤖 Logat ca ${client.user.tag}! EUGVRP Music este pregătit.`);
});

// ==========================================
// 3. COMENZILE BOTULUI
// ==========================================
const PREFIX = '!';

client.on('messageCreate', async (message) => {
    // Ignorăm mesajele de la alți boți sau care nu încep cu prefixul nostru
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Comanda: !play <melodie/link>
    if (command === 'play') {
        if (!message.member.voice.channel) {
            return message.reply('❌ Trebuie să fii într-un canal vocal pentru a pune muzică!');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ Scrie o melodie sau un link YouTube! Ex: `!play Eminem`');
        }

        // Căutăm și dăm play
        try {
            await message.reply(`🔍 Caut: **${query}**...`);
            const { track } = await player.play(message.member.voice.channel, query, {
                nodeOptions: {
                    metadata: message // Păstrăm mesajul pentru a trimite actualizări
                }
            });

            return message.channel.send(`🎶 Am adăugat la coadă: **${track.title}**`);
        } catch (error) {
            console.error(error);
            return message.channel.send('❌ A apărut o eroare la redarea melodiei.');
        }
    }

    // Comanda: !stop
    if (command === 'stop') {
        const queue = player.nodes.get(message.guild.id);
        if (!queue || !queue.isPlaying()) {
            return message.reply('❌ Nu cântă nicio melodie acum!');
        }
        queue.delete();
        return message.reply('🛑 Am oprit muzica și am părăsit canalul.');
    }
});

// Conectăm botul
client.login(process.env.DISCORD_TOKEN);