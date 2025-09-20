const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Railway: Prüfe auf DISCORD_TOKEN
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN Umgebungsvariable fehlt! Bitte in Railway setzen.');
    process.exit(1);
}

// Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Database Setup (Railway: project root persistent volume)
const db = new sqlite3.Database(path.join(__dirname, 'strandmarkt.db'));

// Hilfsfunktion für Geld-Formatierung
function formatCurrency(amount) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Chart Konfiguration
const width = 800;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

// Datenbank-Setup & Migration
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS current_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        market_price REAL NOT NULL,
        state_value REAL,
        image_url TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        market_price REAL NOT NULL,
        state_value REAL,
        image_url TEXT,
        date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
        added_by TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        phone_number TEXT,
        items TEXT NOT NULL,
        offer_type TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        channel_id TEXT,
        message_id TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS offer_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_id INTEGER NOT NULL,
        responder_id TEXT NOT NULL,
        responder_username TEXT NOT NULL,
        response_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (offer_id) REFERENCES offers (id)
    )`);
});

// Bot Events
client.once('ready', () => {
    console.log(`✅ Bot ist online als ${client.user.tag}!`);
    registerCommands();
});

// Command Registrierung
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('angebot-erstellen')
            .setDescription('Erstelle ein neues Handelsangebot')
            .addStringOption(option =>
                option.setName('typ')
                    .setDescription('Art des Angebots')
                    .setRequired(true)
                    .addChoices(
                        { name: '💰 Verkaufe', value: 'sell' },
                        { name: '🛒 Kaufe', value: 'buy' },
                        { name: '🔄 Tausche', value: 'trade' }
                    ))
            .addStringOption(option =>
                option.setName('gegenstände')
                    .setDescription('Was bietest du an/suchst du? (z.B. "AK-47 x2, Pistole x1")')
                    .setRequired(true))
            .addStringOption(option =>
                option.setName('telefon')
                    .setDescription('Deine Ingame-Telefonnummer (optional)')
                    .setRequired(false)),
        new SlashCommandBuilder()
            .setName('meine-angebote')
            .setDescription('Zeige deine aktiven Angebote'),
        new SlashCommandBuilder()
            .setName('angebote-suchen')
            .setDescription('Suche nach Angeboten')
            .addStringOption(option =>
                option.setName('typ')
                    .setDescription('Nach welcher Art suchen?')
                    .setRequired(false)
                    .addChoices(
                        { name: '💰 Verkaufsangebote', value: 'sell' },
                        { name: '🛒 Kaufgesuche', value: 'buy' },
                        { name: '🔄 Tauschangebote', value: 'trade' }
                    ))
            .addStringOption(option =>
                option.setName('gegenstand')
                    .setDescription('Nach bestimmtem Gegenstand suchen')
                    .setRequired(false))
    ];
    try {
        await client.application.commands.set(commands);
        console.log('✅ Slash Commands registriert!');
    } catch (error) {
        console.error('Fehler beim Registrieren der Commands:', error);
    }
}

// Command Handler
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;
            if (commandName === 'angebot-erstellen') await handleCreateOffer(interaction);
            if (commandName === 'meine-angebote') await handleMyOffers(interaction);
            if (commandName === 'angebote-suchen') await handleSearchOffers(interaction);
        } else if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
        }
    } catch (error) {
        console.error('Command Error:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: '❌ Fehler aufgetreten!', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Fehler aufgetreten!', ephemeral: true });
        }
    }
});

// Angebot erstellen
async function handleCreateOffer(interaction) {
    const offerType = interaction.options.getString('typ');
    const items = interaction.options.getString('gegenstände');
    const phoneNumber = interaction.options.getString('telefon');
    const userId = interaction.user.id;
    const username = interaction.user.displayName || interaction.user.username;

    await interaction.deferReply();

    db.run(
        'INSERT INTO offers (user_id, username, phone_number, items, offer_type) VALUES (?, ?, ?, ?, ?)',
        [userId, username, phoneNumber, items, offerType],
        function(err) {
            if (err) {
                console.error(err);
                interaction.followUp('❌ Fehler beim Erstellen des Angebots!');
                return;
            }
            const offerId = this.lastID;
            const typeEmoji = { 'sell': '💰', 'buy': '🛒', 'trade': '🔄' };
            const typeText = { 'sell': 'Verkaufe', 'buy': 'Kaufe', 'trade': 'Tausche' };
            const embed = new EmbedBuilder()
                .setColor(offerType === 'sell' ? '#00ff00' : offerType === 'buy' ? '#ff6600' : '#0099ff')
                .setTitle(`${typeEmoji[offerType]} ${typeText[offerType]}`)
                .setDescription(`**${items}**`)
                .addFields(
                    { name: '👤 Anbieter', value: `<@${userId}>`, inline: true },
                    { name: '📞 Telefon', value: phoneNumber || '*Nicht angegeben*', inline: true },
                    { name: '🆔 Angebots-ID', value: `#${offerId}`, inline: true },
                    { name: '📅 Erstellt', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                    { name: '🔄 Status', value: '🟢 **Aktiv**', inline: true }
                )
                .setFooter({ text: 'GTA V Grand RP • Handelsplatz' })
                .setTimestamp();
            const row = {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 1,
                        label: 'Interesse zeigen',
                        emoji: '✋',
                        custom_id: `respond_${offerId}_${userId}`
                    },
                    {
                        type: 2,
                        style: 4,
                        label: 'Angebot schließen',
                        emoji: '🔒',
                        custom_id: `close_${offerId}_${userId}`
                    }
                ]
            };
            interaction.followUp({
                embeds: [embed],
                components: [row],
                content: `✅ **Angebot erfolgreich erstellt!** 🎯\n\n*Andere Spieler können jetzt Interesse zeigen und dich kontaktieren.*`
            }).then(message => {
                db.run(
                    'UPDATE offers SET channel_id = ?, message_id = ? WHERE id = ?',
                    [interaction.channelId, message.id, offerId]
                );
            });
        }
    );
}

// Eigene Angebote anzeigen
async function handleMyOffers(interaction) {
    const userId = interaction.user.id;
    await interaction.deferReply({ ephemeral: true });
    db.all(
        'SELECT * FROM offers WHERE user_id = ? AND status = "open" ORDER BY created_at DESC LIMIT 10',
        [userId],
        (err, rows) => {
            if (err) {
                console.error(err);
                interaction.followUp({ content: '❌ Fehler beim Abrufen deiner Angebote!', ephemeral: true });
                return;
            }
            if (rows.length === 0) {
                interaction.followUp({
                    content: '📭 Du hast keine aktiven Angebote.\n\nErstelle eines mit `/angebot-erstellen`!',
                    ephemeral: true
                });
                return;
            }
            const embed = new EmbedBuilder()
                .setColor('#9900ff')
                .setTitle('📋 Deine aktiven Angebote')
                .setDescription(`Du hast **${rows.length}** aktive Angebote`)
                .setFooter({ text: 'GTA V Grand RP • Handelsplatz' })
                .setTimestamp();
            rows.forEach(offer => {
                const typeEmoji = { 'sell': '💰', 'buy': '🛒', 'trade': '🔄' };
                const createdTime = Math.floor(new Date(offer.created_at).getTime()/1000);
                embed.addFields({
                    name: `${typeEmoji[offer.offer_type]} Angebot #${offer.id}`,
                    value: `**${offer.items}**\n📞 ${offer.phone_number || '*Keine Nummer*'} • <t:${createdTime}:R>`,
                    inline: false
                });
            });
            interaction.followUp({ embeds: [embed], ephemeral: true });
        }
    );
}

// Angebote suchen
async function handleSearchOffers(interaction) {
    const filterType = interaction.options.getString('typ');
    const searchItem = interaction.options.getString('gegenstand');
    await interaction.deferReply();
    let query = 'SELECT * FROM offers WHERE status = "open"';
    const params = [];
    if (filterType) { query += ' AND offer_type = ?'; params.push(filterType); }
    if (searchItem) { query += ' AND items LIKE ?'; params.push(`%${searchItem}%`); }
    query += ' ORDER BY created_at DESC LIMIT 20';
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(err);
            interaction.followUp('❌ Fehler beim Suchen von Angeboten!');
            return;
        }
        if (rows.length === 0) {
            interaction.followUp('📭 Keine Angebote gefunden die deinen Kriterien entsprechen.');
            return;
        }
        const embed = new EmbedBuilder()
            .setColor('#ff9900')
            .setTitle('🔍 Gefundene Angebote')
            .setDescription(`**${rows.length} Angebote** gefunden`)
            .setFooter({ text: 'GTA V Grand RP • Handelsplatz' })
            .setTimestamp();
        rows.forEach(offer => {
            const typeEmoji = { 'sell': '💰', 'buy': '🛒', 'trade': '🔄' };
            const typeText = { 'sell': 'Verkaufe', 'buy': 'Kaufe', 'trade': 'Tausche' };
            const createdTime = Math.floor(new Date(offer.created_at).getTime()/1000);
            embed.addFields({
                name: `${typeEmoji[offer.offer_type]} ${typeText[offer.offer_type]} - Angebot #${offer.id}`,
                value: `**${offer.items}**\n👤 ${offer.username} | 📞 ${offer.phone_number || '*Keine Nummer*'} | <t:${createdTime}:R>`,
                inline: false
            });
        });
        interaction.followUp({ embeds: [embed] });
    });
}

// Button-Handler (Interesse, Angebot schließen)
async function handleButtonInteraction(interaction) {
    const [action, offerId, responderId] = interaction.customId.split('_');
    if (action === 'respond') {
        await handleOfferResponse(interaction, offerId);
    }
    if (action === 'close') {
        await handleOfferClose(interaction, offerId);
    }
}

// Angebot antworten (Modal)
async function handleOfferResponse(interaction, offerId) {
    const responderId = interaction.user.id;
    db.get('SELECT * FROM offers WHERE id = ? AND status = "open"', [offerId], (err, offer) => {
        if (err || !offer) {
            return interaction.reply({
                content: '❌ Angebot nicht gefunden oder bereits geschlossen!',
                ephemeral: true
            });
        }
        if (offer.user_id === responderId) {
            return interaction.reply({
                content: '❌ Du kannst nicht auf dein eigenes Angebot antworten!',
                ephemeral: true
            });
        }
        const modal = {
            title: `Interesse an Angebot #${offerId}`,
            custom_id: `offer_response_${offerId}`,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'response_text',
                            label: 'Deine Nachricht an den Anbieter',
                            style: 2,
                            placeholder: 'z.B.: Bin interessiert! Meine Nummer: 123-456.',
                            required: true,
                            max_length: 1000
                        }
                    ]
                },
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'contact_info',
                            label: 'Deine Kontaktdaten (Ingame-Nummer, Discord, etc.)',
                            style: 1,
                            placeholder: 'Tel: 123-456 oder Discord: @username#1234',
                            required: false,
                            max_length: 200
                        }
                    ]
                }
            ]
        };
        interaction.showModal(modal);
    });
}

// Angebot schließen
async function handleOfferClose(interaction, offerId) {
    const userId = interaction.user.id;
    db.get('SELECT * FROM offers WHERE id = ? AND user_id = ?', [offerId, userId], (err, offer) => {
        if (err || !offer) {
            return interaction.reply({
                content: '❌ Angebot nicht gefunden oder du bist nicht der Ersteller!',
                ephemeral: true
            });
        }
        db.run('UPDATE offers SET status = "closed" WHERE id = ?', [offerId], (err) => {
            if (err) {
                console.error(err);
                return interaction.reply({
                    content: '❌ Fehler beim Schließen des Angebots!',
                    ephemeral: true
                });
            }
            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#666666')
                .addFields(
                    { name: '🔄 Status', value: '🔒 **Geschlossen**', inline: true }
                );
            const disabledRow = {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 2,
                        label: 'Angebot geschlossen',
                        emoji: '🔒',
                        custom_id: 'disabled',
                        disabled: true
                    }
                ]
            };
            interaction.update({
                embeds: [updatedEmbed],
                components: [disabledRow]
            });
        });
    });
}

// Modal Submit Handler (Antwort auf Angebot)
async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('offer_response_')) {
        const offerId = interaction.customId.split('_')[2];
        const responseText = interaction.fields.getTextInputValue('response_text');
        const contactInfo = interaction.fields.getTextInputValue('contact_info') || 'Nicht angegeben';
        const responderId = interaction.user.id;
        const responderName = interaction.user.displayName || interaction.user.username;
        db.run(
            'INSERT INTO offer_responses (offer_id, responder_id, responder_username, response_text) VALUES (?, ?, ?, ?)',
            [offerId, responderId, responderName, `${responseText}\n\n📞 Kontakt: ${contactInfo}`],
            function(err) {
                if (err) {
                    console.error(err);
                    return interaction.reply({
                        content: '❌ Fehler beim Senden der Antwort!',
                        ephemeral: true
                    });
                }
                db.get('SELECT * FROM offers WHERE id = ?', [offerId], async (err, offer) => {
                    if (err || !offer) {
                        return interaction.reply({
                            content: '❌ Angebot nicht gefunden!',
                            ephemeral: true
                        });
                    }
                    try {
                        const offerCreator = await client.users.fetch(offer.user_id);
                        const dmEmbed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('📬 Neue Antwort auf dein Angebot!')
                            .setDescription(`**Angebot #${offerId}**: ${offer.items}`)
                            .addFields(
                                { name: '👤 Von', value: responderName, inline: true },
                                { name: '📞 Kontakt', value: contactInfo, inline: true },
                                { name: '💬 Nachricht', value: responseText, inline: false }
                            )
                            .setFooter({ text: 'GTA V Grand RP • Handelsplatz' })
                            .setTimestamp();
                        await offerCreator.send({ embeds: [dmEmbed] });
                        interaction.reply({
                            content: '✅ **Deine Nachricht wurde gesendet!**\n\nDer Anbieter wurde per DM benachrichtigt.',
                            ephemeral: true
                        });
                    } catch (dmError) {
                        console.error('DM Error:', dmError);
                        interaction.reply({
                            content: `✅ **Nachricht gesendet!**\n\n<@${offer.user_id}>, du hast eine neue Antwort auf dein Angebot #${offerId}! 📬\n\n**Von:** ${responderName}\n**Kontakt:** ${contactInfo}\n**Nachricht:** ${responseText}`,
                            allowedMentions: { users: [offer.user_id] }
                        });
                    }
                });
            }
        );
    }
}

// Error Handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);
