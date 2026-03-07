const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('get_server_link').setLabel('Obține Link').setStyle(ButtonStyle.Primary).setEmoji('🔗'));
            const sChannel = guild.channels.cache.get(CHANNELS.SESIUNE);
            if (sChannel) await sChannel.send({ content: `@everyone @here <@&${ROLES.CETATENI}>\n🚀 **Sesiune pornită!**`, embeds: [embed], components: [row] });
            await sendLog(guild, 'Sesiune Pornită', `Host: ${user}`, '#00FF00');
            return interaction.reply({ content: '✅ Sesiune pornită!', ephemeral: true });
        }

        if (commandName === 'sesiune_stop' || commandName === 'admin_stop_sesiune') {
            if (!member.roles.cache.has(ROLES.SESSION_HOST) && !member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Acces interzis.', ephemeral: true });
            if (!sessionData.active) return interaction.reply({ content: '❌ Nicio sesiune.', ephemeral: true });
            const dur = Date.now() - sessionData.startTime;
            activeShifts.forEach((val, key) => { if(userStats.has(key)) { let st = userStats.get(key); st.totalTime += (Date.now() - val.startTime); st.shifts++; } });
            activeShifts.clear(); sessionData.active = false; sessionData.link = null;
            const embed = new EmbedBuilder().setTitle('🔴 SESIUNE ÎNCHEIATĂ').setColor('#FF0000').addFields({ name: 'Durată', value: `\`${msToTime(dur)}\``, inline: true }, { name: 'Ture', value: `\`${sessionData.shiftsCount}\``, inline: true }).setTimestamp();
            const sChannel = guild.channels.cache.get(CHANNELS.SESIUNE);
            if (sChannel) await sChannel.send({ embeds: [embed] });
            await sendLog(guild, 'Sesiune Oprită', `Oprită de ${user}`, '#FF0000');
            return interaction.reply({ content: '✅ Oprită.', ephemeral: true });
        }

        if (commandName === 'tura_start') {
            if (!sessionData.active) return interaction.reply({ content: '❌ Nu există sesiune!', ephemeral: true });
            if (activeShifts.has(user.id)) return interaction.reply({ content: '❌ Ești în tură deja!', ephemeral: true });
            const ales = interaction.options.getString('departament');
            let c, e;
            if (ales === 'Poliție') { c = '#0055ff'; e = '🚓'; if(!member.roles.cache.has(ROLES.POLITIE)) return interaction.reply({content:'Nu ai rol!', ephemeral:true}); }
            else if (ales === 'Pompieri') { c = '#ff0000'; e = '🚒'; if(!member.roles.cache.has(ROLES.POMPIERI)) return interaction.reply({content:'Nu ai rol!', ephemeral:true}); }
            else if (ales === 'DOT') { c = '#ffcc00'; e = '🚧'; if(!member.roles.cache.has(ROLES.DOT)) return interaction.reply({content:'Nu ai rol!', ephemeral:true}); }

            activeShifts.set(user.id, { dept: ales, startTime: Date.now() }); sessionData.activeMembers.add(user.id); sessionData.shiftsCount++;
            if (!userStats.has(user.id)) userStats.set(user.id, { shifts: 0, totalTime: 0, dept: ales });
            const embed = new EmbedBuilder().setTitle(`${e} TURĂ ÎNCEPUTĂ`).setColor(c).addFields({ name: 'Membru', value: `${user}`, inline: true }, { name: 'Facțiune', value: `**${ales}**`, inline: true }).setTimestamp();
            const tChan = guild.channels.cache.get(CHANNELS.TURE);
            if (tChan) await tChan.send({ embeds: [embed] });
            await sendLog(guild, 'Tură Pornită', `${user} -> ${ales}`, c);
            return interaction.reply({ content: '✅ Ești în tură.', ephemeral: true });
        }

        if (commandName === 'tura_stop' || commandName === 'admin_stop_tura') {
            const tgt = interaction.options.getUser('utilizator') || user;
            if (commandName === 'admin_stop_tura' && !member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: 'Fără permisiuni!', ephemeral: true });
            if (!activeShifts.has(tgt.id)) return interaction.reply({ content: '❌ Nu e în tură.', ephemeral: true });
            const sData = activeShifts.get(tgt.id); const dur = Date.now() - sData.startTime; activeShifts.delete(tgt.id);
            let st = userStats.get(tgt.id); st.shifts++; st.totalTime += dur; userStats.set(tgt.id, st);
            const embed = new EmbedBuilder().setTitle('🛑 TURĂ OPRITĂ').setColor('#2b2d31').addFields({ name: 'Membru', value: `${tgt}`, inline: true }, { name: 'Durată', value: `\`${msToTime(dur)}\``, inline: true }).setTimestamp();
            const tChan = guild.channels.cache.get(CHANNELS.TURE);
            if (tChan) await tChan.send({ embeds: [embed] });
            await sendLog(guild, 'Tură Oprită', `${tgt} - Durată: ${msToTime(dur)}`, '#2b2d31');
            return interaction.reply({ content: '✅ Tură oprită.', ephemeral: true });
        }

        if (commandName === 'ticket_panel') {
            if (user.id !== OWNER_ID && !member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '❌ Doar Staff.', ephemeral: true });
            const canalSelectat = interaction.options.getChannel('canal');
            const embed = new EmbedBuilder().setTitle('📩 SUPORT EUGVRP').setDescription('Apasă mai jos pentru un ticket de suport.').setColor('#5865F2');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Creează Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'));
            await canalSelectat.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: `✅ Panou creat în ${canalSelectat}!`, ephemeral: true });
        }

        if (commandName === 'stats' || commandName === 'sesiune_status' || commandName === 'tura_status') {
             return interaction.reply({ content: `Această funcție e activă (fără istoric salvat vizibil acum)`, ephemeral: true });
        }

    } catch (error) {
        console.error('Eroare comanda:', error);
        if(!interaction.replied) interaction.reply({ content: '❌ Eroare neașteptată.', ephemeral: true }).catch(()=>{});
    }
});

client.login(process.env.TOKEN);
