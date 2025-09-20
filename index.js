// Create Offer Handler
async function handleCreateOffer(interaction) {
    const offerType = interaction.options.getString('typ');
    const items = interaction.options.getString('gegenstände');
    const phoneNumber = interaction.options.getString('telefon');
    const userId = interaction.user.id;
    const username = interaction.user.displayName || interaction.user.username;

    await interaction.deferReply();

    // Angebot in Datenbank speichern
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
            
            // Emoji und Text je nach Typ
            const typeEmoji = {
                'sell': '💰',
                'buy': '🛒', 
                'trade': '🔄'
            };
            
            const typeText = {
                'sell': 'Verkaufe',
                'buy': 'Kaufe',
                'trade': 'Tausche'
            };

            const embed = new EmbedBuilder()
                .setColor(offerType === 'sell' ? '#00ff00' : offerType === 'buy' ? '#ff6600' : '#0099ff')
                .setTitle(`${typeEmoji[offerType]} ${typeText[offerType]}`)
                .setDescription(`**${items}**`)
                .addFields(
                    { name: '👤 Anbieter', value: `<@${userId}>`, inline: true },
                    { name: '📞 Telefon', value: phoneNumber || '*Nicht angegeben*', inline: true },
                    { name: '🆔 Angebots-ID', value: `#${offerId}`, inline: true },
                    { name: '📅 Erstellt', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
                    { name: '🔄 Status', value: '🟢 **Aktiv**', inline: true }
                )
                .setFooter({ text: 'GTA V Grand RP • Handelsplatz' })
                .setTimestamp();

            // Buttons für Interaktion
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
                // Message ID und Channel ID speichern für spätere Updates
                db.run(
                    'UPDATE offers SET channel_id = ?, message_id = ? WHERE id = ?',
                    [interaction.channelId, message.id, offerId]
                );
            });
        }
    );
}

// My Offers Handler
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
                const typeEmoji = {
                    'sell': '💰',
                    'buy': '🛒',
                    'trade': '🔄'
                };

                const createdTime = Math.floor(new Date(offer.created_at).getTime() / 1000);
                
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

// Search Offers Handler  
async function handleSearchOffers(interaction) {
    const filterType = interaction.options.getString('typ');
    const searchItem = interaction.options.getString('gegenstand');

    await interaction.deferReply();

    let query = 'SELECT * FROM offers WHERE status = "open"';
    let params = [];

    if (filterType) {
        query += ' AND offer_type = ?';
        params.push(filterType);
    }

    if (searchItem) {
        query += ' AND items LIKE ?';
        params.push(`%${searchItem}%`);
    }

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
            const typeEmoji = {
                'sell': '💰',
                'buy': '🛒',
                'trade': '🔄'
            };
            
            const typeText = {
                'sell': 'Verkaufe',
                'buy': 'Kaufe',
                'trade': 'Tausche'
            };

            const createdTime = Math.floor(new Date(offer.created_at).getTime() / 1000);
            
            embed.addFields({
                name: `${typeEmoji[offer.offer_type]} ${typeText[offer.offer_type]} - Angebot #${offer.id}`,
                value: `**${offer.items}**\n👤 ${offer.username} | 📞 ${offer.phone_number || '*Keine Nummer*'} | <t:${createdTime}:R>`,
                inline: false
            });
        });

        interaction.followUp({ embeds: [embed] });
    });
}

// Offer Response Handler
async function handleOfferResponse(interaction, offerId) {
    const responderId = interaction.user.id;
    const responderName = interaction.user.displayName || interaction.user.username;

    // Prüfe ob Angebot existiert und aktiv ist
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

        // Modal für Antwort erstellen
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
                            placeholder: 'z.B.: Bin interessiert! Meine Nummer: 123-456. Wann können wir uns treffen?',
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

// Offer Close Handler
async function handleOfferClose(interaction, offerId) {
    const userId = interaction.user.id;

    db.get('SELECT * FROM offers WHERE id = ? AND user_id = ?', [offerId, userId], (err, offer) => {
        if (err || !offer) {
            return interaction.reply({
                content: '❌ Angebot nicht gefunden oder du bist nicht der Ersteller!',
                ephemeral: true
            });
        }

        // Angebot schließen
        db.run('UPDATE offers SET status = "closed" WHERE id = ?', [offerId], (err) => {
            if (err) {
                console.error(err);
                return interaction.reply({
                    content: '❌ Fehler beim Schließen des Angebots!',
                    ephemeral: true
                });
            }

            // Original-Message aktualisieren
            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#666666')
                .addFields(
                    { name: '🔄 Status', value: '🔒 **Geschlossen**', inline: true }
                );

            // Buttons deaktivieren
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

// Modal Submit Handler (muss zu interactionCreate hinzugefügt werden)
client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    }
});

// Modal Submit Handler
async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('offer_response_')) {
        const offerId = interaction.customId.split('_')[2];
        const responseText = interaction.fields.getTextInputValue('response_text');
        const contactInfo = interaction.fields.getTextInputValue('contact_info') || 'Nicht angegeben';
        const responderId = interaction.user.id;
        const responderName = interaction.user.displayName || interaction.user.username;

        // Antwort in Datenbank speichern
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

                // Angebot-Ersteller benachrichtigen
                db.get('SELECT * FROM offers WHERE id = ?', [offerId], async (err, offer) => {
                    if (err || !offer) {
                        return interaction.reply({
                            content: '❌ Angebot nicht gefunden!',
                            ephemeral: true
                        });
                    }

                    // DM an Angebot-Ersteller
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
                            content: '✅ **Deine Nachricht wurde gesendet!**\n\nDer Anbieter wurde per DM benachrichtigt und kann dich jetzt kontaktieren.',
                            ephemeral: true
                        });
                        
                    } catch (dmError) {
                        console.error('DM Error:', dmError);
                        
                        // Fallback: Public mention wenn DM fehlschlägt
                        interaction.reply({
                            content: `✅ **Nachricht gesendet!**\n\n<@${offer.user_id}>, du hast eine neue Antwort auf dein Angebot #${offerId}! 📬\n\n**Von:** ${responderName}\n**Kontakt:** ${contactInfo}\n**Nachricht:** ${responseText}`,
                            allowedMentions: { users: [offer.user_id] }
                        });
                    }
                });
            }
        );
    }
}// Average Price Handler
async function handleAveragePrice(interaction) {
    const searchName = interaction.options.getString('gegenstand').trim();

    await interaction.deferReply();

    db.all(
        'SELECT market_price, state_value FROM price_history WHERE display_name = ? OR item_name = ?',
        [searchName, searchName.toLowerCase()],
        (err, rows) => {
            if (err) {
                console.error(err);
                interaction.followUp('Fehler beim Berechnen des Durchschnitts!');
                return;
            }

            if (rows.length === 0) {
                interaction.followUp(`❌ Keine Daten für "${searchName}" gefunden!`);
                return;
            }

            const marketPrices = rows.map(row => parseFloat(row.market_price)).filter(price => !isNaN(price));
            const statePrices = rows.map(row => parseFloat(row.state_value)).filter(price => !isNaN(price) && price > 0);
            
            if (marketPrices.length === 0) {
                interaction.followUp(`❌ Keine gültigen Marktpreise für "${searchName}" gefunden!`);
                return;
            }

            const averageMarket = marketPrices.reduce((sum, price) => sum + price, 0) / marketPrices.length;
            const minMarket = Math.min(...marketPrices);
            const maxMarket = Math.max(...marketPrices);

            const embed = new EmbedBuilder()
                .setColor('#9900ff')
                .setTitle(`📊 Statistiken: ${searchName}`)
                .setDescription(`**Basierend auf ${rows.length} Preiseinträgen**`)
                .addFields(
                    { name: '💰 Ø Marktpreis', value: `**${formatCurrency(averageMarket)}**`, inline: true },
                    { name: '📉 Min. Marktpreis', value: `**${formatCurrency(minMarket)}**`, inline: true },
                    { name: '📈 Max. Marktpreis', value: `**${formatCurrency(maxMarket)}**`, inline: true },
                    { name: '📊 Markt-Schwankung', value: `**${formatCurrency(maxMarket - minMarket)}**`, inline: true },
                    { name: '📈 Markt-Varianz', value: `${((maxMarket - minMarket) / averageMarket * 100).toFixed(1)}%`, inline: true },
                    { name: '📋 Marktpreis-Einträge', value: `**${marketPrices.length}**`, inline: true }
                )
                .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                .setTimestamp();

            // Staatswert-Statistiken hinzufügen wenn verfügbar
            if (statePrices.length > 0) {
                const averageState = statePrices.reduce((sum, price) => sum + price, 0) / statePrices.length;
                const minState = Math.min(...statePrices);
                const maxState = Math.max(...statePrices);
                const avgProfit = averageMarket - averageState;
                const avgProfitPercent = ((avgProfit / averageState) * 100).toFixed(1);

                embed.addFields(
                    { name: '🏛️ Ø Staatswert', value: `**${formatCurrency(averageState)}**`, inline: true },
                    { name: '📉 Min. Staatswert', value: `**${formatCurrency(minState)}**`, inline: true },
                    { name: '📈 Max. Staatswert', value: `**${formatCurrency(maxState)}**`, inline: true },
                    { name: '💹 Ø Gewinn/Verlust', value: `**${formatCurrency(avgProfit)}**`, inline: true },
                    { name: '📊 Ø Gewinn %', value: `**${avgProfitPercent}%**`, inline: true },
                    { name: '🏛️ Staatswert-Einträge', value: `**${statePrices.length}**`, inline: true }
                );
            } else {
                embed.addFields({
                    name: '🏛️ Staatswerte', 
                    value: '*Keine Staatswerte verfügbar*', 
                    inline: false
                });
            }

            interaction.followUp({ embeds: [embed] });
        }
    );
}const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Bot Setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Database Setup
const db = new sqlite3.Database('./strandmarkt.db');

// Initialize Database
db.serialize(() => {
    // Tabelle für aktuelle Preise
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

    // Tabelle für Preishistorie
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

    // Tabelle für Angebote/Tickets
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

    // Tabelle für Angebot-Antworten
    db.run(`CREATE TABLE IF NOT EXISTS offer_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_id INTEGER NOT NULL,
        responder_id TEXT NOT NULL,
        responder_username TEXT NOT NULL,
        response_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (offer_id) REFERENCES offers (id)
    )`);

    // Migration für bestehende Datenbanken (falls jemand von alter Version kommt)
    db.all("PRAGMA table_info(current_prices)", (err, columns) => {
        if (!err && columns) {
            const hasDisplayName = columns.some(col => col.name === 'display_name');
            const hasMarketPrice = columns.some(col => col.name === 'market_price');
            const hasStateValue = columns.some(col => col.name === 'state_value');
            
            if (!hasDisplayName || !hasMarketPrice || !hasStateValue) {
                console.log('🔄 Migriere alte Datenbank...');
                
                // Backup der alten Tabelle
                db.run(`CREATE TABLE IF NOT EXISTS current_prices_backup AS SELECT * FROM current_prices`);
                
                // Neue Spalten hinzufügen falls sie nicht existieren
                if (!hasDisplayName) {
                    db.run(`ALTER TABLE current_prices ADD COLUMN display_name TEXT DEFAULT ''`);
                    db.run(`UPDATE current_prices SET display_name = item_name WHERE display_name = ''`);
                }
                if (!hasMarketPrice && !hasStateValue) {
                    db.run(`ALTER TABLE current_prices ADD COLUMN market_price REAL DEFAULT 0`);
                    db.run(`ALTER TABLE current_prices ADD COLUMN state_value REAL DEFAULT NULL`);
                    db.run(`UPDATE current_prices SET market_price = price WHERE market_price = 0`);
                }
                
                console.log('✅ Datenbank-Migration abgeschlossen!');
            }
        }
    });

    // Migration für Historie-Tabelle
    db.all("PRAGMA table_info(price_history)", (err, columns) => {
        if (!err && columns) {
            const hasDisplayName = columns.some(col => col.name === 'display_name');
            const hasMarketPrice = columns.some(col => col.name === 'market_price');
            
            if (!hasDisplayName || !hasMarketPrice) {
                console.log('🔄 Migriere Historie-Tabelle...');
                
                if (!hasDisplayName) {
                    db.run(`ALTER TABLE price_history ADD COLUMN display_name TEXT DEFAULT ''`);
                    db.run(`UPDATE price_history SET display_name = item_name WHERE display_name = ''`);
                }
                if (!hasMarketPrice) {
                    db.run(`ALTER TABLE price_history ADD COLUMN market_price REAL DEFAULT 0`);
                    db.run(`ALTER TABLE price_history ADD COLUMN state_value REAL DEFAULT NULL`);
                    db.run(`UPDATE price_history SET market_price = price WHERE market_price = 0`);
                }
                
                console.log('✅ Historie-Migration abgeschlossen!');
            }
        }
    });
});

// Chart Configuration
const width = 800;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

// Hilfsfunktion für Geld-Formatierung
function formatCurrency(amount) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Bot Events
client.once('ready', () => {
    console.log(`Bot ist online als ${client.user.tag}!`);
    registerCommands();
});

// Register Slash Commands
async function registerCommands() {
    const commands = [
        new SlashCommandBuilder()
            .setName('preis-hinzufugen')
            .setDescription('Füge einen neuen Strandmarktpreis hinzu')
            .addStringOption(option =>
                option.setName('gegenstand')
                    .setDescription('Name des Gegenstands (z.B. AK-47)')
                    .setRequired(true)
                    .setAutocomplete(true))
            .addNumberOption(option =>
                option.setName('marktpreis')
                    .setDescription('Aktueller Marktpreis (Handel zwischen Spielern)')
                    .setRequired(true))
            .addNumberOption(option =>
                option.setName('staatswert')
                    .setDescription('Staatswert/NPC-Preis (optional)')
                    .setRequired(false))
            .addAttachmentOption(option =>
                option.setName('bild')
                    .setDescription('Bild-Datei hochladen (optional)')
                    .setRequired(false)),

        new SlashCommandBuilder()
            .setName('preis-anzeigen')
            .setDescription('Zeige den aktuellen Preis eines Gegenstands')
            .addStringOption(option =>
                option.setName('gegenstand')
                    .setDescription('Name des Gegenstands')
                    .setRequired(true)
                    .setAutocomplete(true)),

        new SlashCommandBuilder()
            .setName('alle-preise')
            .setDescription('Zeige alle aktuellen Strandmarktpreise'),

        new SlashCommandBuilder()
            .setName('preis-verlauf')
            .setDescription('Zeige den Preisverlauf eines Gegenstands mit Diagramm')
            .addStringOption(option =>
                option.setName('gegenstand')
                    .setDescription('Name des Gegenstands')
                    .setRequired(true)
                    .setAutocomplete(true)),

        new SlashCommandBuilder()
            .setName('durchschnittspreis')
            .setDescription('Zeige den Durchschnittspreis eines Gegenstands')
            .addStringOption(option =>
                option.setName('gegenstand')
                    .setDescription('Name des Gegenstands')
                    .setRequired(true)
                    .setAutocomplete(true)),

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
        console.log('Registriere Slash Commands...');
        await client.application.commands.set(commands);
        console.log('Slash Commands erfolgreich registriert!');
    } catch (error) {
        console.error('Fehler beim Registrieren der Commands:', error);
    }
}

// Command Handler
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'preis-hinzufugen':
                    await handleAddPrice(interaction);
                    break;
                case 'preis-anzeigen':
                    await handleShowPrice(interaction);
                    break;
                case 'alle-preise':
                    await handleShowAllPrices(interaction);
                    break;
                case 'preis-verlauf':
                    await handlePriceHistory(interaction);
                    break;
                case 'durchschnittspreis':
                    await handleAveragePrice(interaction);
                    break;
                case 'angebot-erstellen':
                    await handleCreateOffer(interaction);
                    break;
                case 'meine-angebote':
                    await handleMyOffers(interaction);
                    break;
                case 'angebote-suchen':
                    await handleSearchOffers(interaction);
                    break;
            }
        } catch (error) {
            console.error('Command Error:', error);
            await interaction.reply({
                content: 'Es ist ein Fehler aufgetreten!',
                ephemeral: true
            });
        }
    } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
    } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    }
});

// Button Interaction Handler
async function handleButtonInteraction(interaction) {
    const [action, offerId, responderId] = interaction.customId.split('_');
    
    if (action === 'respond' && interaction.user.id !== responderId) {
        return interaction.reply({
            content: '❌ Du kannst nur auf deine eigenen Antwort-Buttons klicken!',
            ephemeral: true
        });
    }

    switch (action) {
        case 'respond':
            await handleOfferResponse(interaction, offerId);
            break;
        case 'close':
            await handleOfferClose(interaction, offerId);
            break;
    }
}

// Autocomplete Handler
async function handleAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    
    db.all(
        'SELECT DISTINCT display_name, item_name FROM current_prices WHERE display_name LIKE ? OR item_name LIKE ? ORDER BY display_name LIMIT 25',
        [`%${focusedValue}%`, `%${focusedValue.toLowerCase()}%`],
        (err, rows) => {
            if (err) {
                console.error(err);
                return interaction.respond([]);
            }

            const choices = rows.map(row => ({
                name: row.display_name,
                value: row.display_name
            }));

            interaction.respond(choices);
        }
    );
}

// Add Price Handler
async function handleAddPrice(interaction) {
    const displayName = interaction.options.getString('gegenstand').trim();
    const itemName = displayName.toLowerCase();
    const marketPrice = interaction.options.getNumber('marktpreis');
    const stateValue = interaction.options.getNumber('staatswert');
    const imageAttachment = interaction.options.getAttachment('bild');
    const userId = interaction.user.tag;

    await interaction.deferReply();

    let imageUrl = null;
    if (imageAttachment) {
        // Prüfe ob es ein Bild ist
        if (imageAttachment.contentType && imageAttachment.contentType.startsWith('image/')) {
            imageUrl = imageAttachment.url;
        } else {
            return interaction.followUp('❌ Die hochgeladene Datei muss ein Bild sein (PNG, JPG, GIF, etc.)!');
        }
    }

    // Zur Historie hinzufügen
    db.run(
        'INSERT INTO price_history (item_name, display_name, market_price, state_value, image_url, added_by) VALUES (?, ?, ?, ?, ?, ?)',
        [itemName, displayName, marketPrice, stateValue, imageUrl, userId]
    );

    // Aktuellen Preis aktualisieren oder hinzufügen - ohne bestehende Werte zu überschreiben
    db.get('SELECT * FROM current_prices WHERE item_name = ?', [itemName], (err, existingRow) => {
        if (err) {
            console.error(err);
            interaction.followUp('Fehler beim Prüfen bestehender Daten!');
            return;
        }

        // Bestimme finale Werte - behalte alte Werte wenn neue nicht angegeben
        let finalStateValue = stateValue;
        let finalImageUrl = imageUrl;

        if (existingRow) {
            // Behalte alte Werte wenn keine neuen angegeben wurden
            if (stateValue === null && existingRow.state_value !== null) {
                finalStateValue = existingRow.state_value;
            }
            if (!imageUrl && existingRow.image_url) {
                finalImageUrl = existingRow.image_url;
            }
        }

        db.run(
            `INSERT OR REPLACE INTO current_prices (item_name, display_name, market_price, state_value, image_url, updated_by, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [itemName, displayName, marketPrice, finalStateValue, finalImageUrl, userId],
            function(err) {
                if (err) {
                    console.error(err);
                    interaction.followUp('Fehler beim Speichern des Preises!');
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Preis erfolgreich aktualisiert!')
                    .addFields(
                        { name: '📦 Gegenstand', value: `\`${displayName}\``, inline: true },
                        { name: '💰 Marktpreis', value: `**${formatCurrency(marketPrice)}**`, inline: true },
                        { name: '🏛️ Staatswert', value: finalStateValue ? `**${formatCurrency(finalStateValue)}**` : '*Nicht angegeben*', inline: true },
                        { name: '👤 Aktualisiert von', value: userId, inline: true },
                        { name: '🕐 Zeitpunkt', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true }
                    )
                    .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                    .setTimestamp();

                // Status-Info hinzufügen
                let statusInfo = '🆕 Neuer Eintrag erstellt';
                if (existingRow) {
                    statusInfo = '🔄 Bestehender Eintrag aktualisiert';
                    if (finalStateValue !== stateValue && stateValue === null) {
                        statusInfo += ' (Staatswert beibehalten)';
                    }
                    if (finalImageUrl !== imageUrl && !imageUrl) {
                        statusInfo += ' (Bild beibehalten)';
                    }
                }

                embed.addFields({ name: 'ℹ️ Status', value: statusInfo, inline: false });

                // Gewinnberechnung wenn beide Preise vorhanden
                if (finalStateValue && finalStateValue > 0) {
                    const profit = marketPrice - finalStateValue;
                    const profitPercent = ((profit / finalStateValue) * 100).toFixed(1);
                    const profitColor = profit > 0 ? '📈' : '📉';
                    
                    embed.addFields({
                        name: `${profitColor} Gewinn/Verlust`,
                        value: `**${formatCurrency(profit)}** (${profitPercent}%)`,
                        inline: false
                    });
                }

                if (finalImageUrl) {
                    embed.setThumbnail(finalImageUrl);
                }

                interaction.followUp({ embeds: [embed] });
            }
        );
    });
}

// Show Price Handler
async function handleShowPrice(interaction) {
    const searchName = interaction.options.getString('gegenstand').trim();

    await interaction.deferReply();

    // Suche sowohl nach display_name als auch item_name
    db.get(
        'SELECT * FROM current_prices WHERE display_name = ? OR item_name = ?',
        [searchName, searchName.toLowerCase()],
        (err, row) => {
            if (err) {
                console.error(err);
                interaction.followUp('Fehler beim Abrufen des Preises!');
                return;
            }

            if (!row) {
                interaction.followUp(`❌ Kein Preis für "${searchName}" gefunden!`);
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`💰 ${row.display_name}`)
                .setDescription(`**Aktuelle Strandmarktpreise**`)
                .addFields(
                    { name: '💵 Marktpreis', value: `**${formatCurrency(row.market_price)}**`, inline: true },
                    { name: '🏛️ Staatswert', value: row.state_value ? `**${formatCurrency(row.state_value)}**` : '*Nicht verfügbar*', inline: true },
                    { name: '📅 Letzte Aktualisierung', value: `<t:${Math.floor(new Date(row.last_updated).getTime() / 1000)}:R>`, inline: true },
                    { name: '👤 Von', value: `${row.updated_by}`, inline: true }
                )
                .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                .setTimestamp();

            // Gewinnberechnung wenn beide Preise vorhanden
            if (row.state_value && row.state_value > 0) {
                const profit = row.market_price - row.state_value;
                const profitPercent = ((profit / row.state_value) * 100).toFixed(1);
                const profitColor = profit > 0 ? '📈' : '📉';
                const profitText = profit > 0 ? 'Gewinn' : 'Verlust';
                
                embed.addFields({
                    name: `${profitColor} ${profitText} pro Stück`,
                    value: `**${formatCurrency(Math.abs(profit))}** (${Math.abs(profitPercent)}%)`,
                    inline: false
                });
            }

            if (row.image_url) {
                embed.setThumbnail(row.image_url);
            }

            interaction.followUp({ embeds: [embed] });
        }
    );
}

// Show All Prices Handler
async function handleShowAllPrices(interaction) {
    await interaction.deferReply();

    db.all(
        'SELECT * FROM current_prices ORDER BY item_name',
        (err, rows) => {
            if (err) {
                console.error(err);
                interaction.followUp('Fehler beim Abrufen der Preise!');
                return;
            }

            if (rows.length === 0) {
                interaction.followUp('❌ Keine Preise in der Datenbank gefunden!');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('📋 Alle Strandmarktpreise')
                .setDescription(`**${rows.length} Artikel verfügbar**`)
                .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                .setTimestamp();

            // Sortiere nach Marktpreis (höchster zuerst)
            rows.sort((a, b) => b.market_price - a.market_price);

            // Erstelle schönere Anzeige in Spalten
            let itemList = '';
            rows.forEach((row, index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📦';
                itemList += `${emoji} **${row.display_name}**\n`;
                itemList += `💰 ${formatCurrency(row.market_price)}`;
                
                if (row.state_value) {
                    const profit = row.market_price - row.state_value;
                    const profitEmoji = profit > 0 ? '📈' : profit < 0 ? '📉' : '➡️';
                    itemList += ` | 🏛️ ${formatCurrency(row.state_value)} ${profitEmoji}`;
                }
                
                itemList += ` • <t:${Math.floor(new Date(row.last_updated).getTime() / 1000)}:R>\n\n`;
            });

            if (itemList.length > 4000) {
                itemList = itemList.substring(0, 4000) + '...\n\n*Zu viele Artikel - zeige nur die ersten*';
            }

            embed.setDescription(`**${rows.length} Artikel verfügbar**\n\n${itemList}`);

            interaction.followUp({ embeds: [embed] });
        }
    );
}

// Price History Handler with Chart
async function handlePriceHistory(interaction) {
    const searchName = interaction.options.getString('gegenstand').trim();

    await interaction.deferReply();

    // Suche in Historie sowohl nach display_name als auch item_name
    db.all(
        'SELECT market_price as price, state_value, date_added FROM price_history WHERE display_name = ? OR item_name = ? ORDER BY date_added',
        [searchName, searchName.toLowerCase()],
        async (err, rows) => {
            if (err) {
                console.error(err);
                interaction.followUp('Fehler beim Abrufen der Historie!');
                return;
            }

            if (rows.length === 0) {
                interaction.followUp(`❌ Keine Historie für "${searchName}" gefunden!`);
                return;
            }

            // Chart erstellen
            const labels = rows.map(row => new Date(row.date_added).toLocaleDateString('de-DE'));
            const marketPrices = rows.map(row => row.price);
            const statePrices = rows.map(row => row.state_value || null);

            const datasets = [{
                label: 'Marktpreis',
                data: marketPrices,
                borderColor: '#ff6600',
                backgroundColor: 'rgba(255, 102, 0, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 6,
                pointHoverRadius: 8,
                borderWidth: 3
            }];

            // Staatswert-Linie hinzufügen wenn Daten vorhanden
            const hasStateValues = statePrices.some(price => price !== null);
            if (hasStateValues) {
                datasets.push({
                    label: 'Staatswert',
                    data: statePrices,
                    borderColor: '#00aa00',
                    backgroundColor: 'rgba(0, 170, 0, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                    borderDash: [5, 5]
                });
            }

            const configuration = {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: `📈 Preisverlauf: ${searchName}`,
                            font: { size: 16, weight: 'bold' }
                        },
                        legend: {
                            display: hasStateValues,
                            position: 'top'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            title: {
                                display: true,
                                text: 'Preis in Euro (€)',
                                font: { size: 14, weight: 'bold' },
                                color: '#ffffff'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#ffffff',
                                callback: function(value) {
                                    return new Intl.NumberFormat('de-DE', {
                                        style: 'currency',
                                        currency: 'EUR',
                                        minimumFractionDigits: 0
                                    }).format(value);
                                }
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Datum der Preisänderung',
                                font: { size: 14, weight: 'bold' },
                                color: '#ffffff'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#ffffff'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                color: '#ffffff'
                            }
                        }
                    }
                }
            };

            try {
                const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
                const attachment = new AttachmentBuilder(imageBuffer, { name: 'preisverlauf.png' });

                const embed = new EmbedBuilder()
                    .setColor('#ff6600')
                    .setTitle(`📈 Preisverlauf: ${searchName}`)
                    .setDescription(`**${rows.length} Preiseinträge** • Diagramm zeigt die Entwicklung`)
                    .addFields(
                        { name: '📊 Aktueller Marktpreis', value: `${formatCurrency(marketPrices[marketPrices.length - 1])}`, inline: true },
                        { name: '📈 Höchster Marktpreis', value: `${formatCurrency(Math.max(...marketPrices))}`, inline: true },
                        { name: '📉 Niedrigster Marktpreis', value: `${formatCurrency(Math.min(...marketPrices))}`, inline: true }
                    )
                    .setImage('attachment://preisverlauf.png')
                    .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                    .setTimestamp();

                interaction.followUp({ embeds: [embed], files: [attachment] });
            } catch (chartError) {
                console.error('Chart Error:', chartError);
                
                // Fallback: Text-basierte Anzeige
                const embed = new EmbedBuilder()
                    .setColor('#ff6600')
                    .setTitle(`📈 Preisverlauf: ${searchName}`)
                    .setDescription('⚠️ Diagramm konnte nicht erstellt werden. Hier die letzten 10 Einträge:')
                    .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                    .setTimestamp();

                const lastEntries = rows.slice(-10);
                let priceHistory = '';
                lastEntries.forEach((row, index) => {
                    const date = new Date(row.date_added);
                    const timestamp = Math.floor(date.getTime() / 1000);
                    priceHistory += `**${formatCurrency(row.price)}**`;
                    if (row.state_value) {
                        priceHistory += ` (🏛️ ${formatCurrency(row.state_value)})`;
                    }
                    priceHistory += ` • <t:${timestamp}:R>\n`;
                });

                embed.setDescription(`⚠️ Diagramm konnte nicht erstellt werden.\n\n**Letzte ${lastEntries.length} Einträge:**\n${priceHistory}`);

                interaction.followUp({ embeds: [embed] });
            }
        }
    );
}

// Average Price Handler
async function handleAveragePrice(interaction) {
    const itemName = interaction.options.getString('gegenstand').toLowerCase();

    await interaction.deferReply();

    db.all(
        'SELECT price FROM price_history WHERE item_name = ?',
        [itemName],
        (err, rows) => {
            if (err) {
                console.error(err);
                interaction.followUp('Fehler beim Berechnen des Durchschnitts!');
                return;
            }

            if (rows.length === 0) {
                interaction.followUp(`❌ Keine Daten für "${itemName}" gefunden!`);
                return;
            }

            const prices = rows.map(row => row.price);
            const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            const embed = new EmbedBuilder()
                .setColor('#9900ff')
                .setTitle(`📊 Statistiken: ${itemName}`)
                .setDescription(`**Basierend auf ${rows.length} Preiseinträgen**`)
                .addFields(
                    { name: '💰 Durchschnittspreis', value: `**${formatCurrency(average)}**`, inline: true },
                    { name: '📉 Niedrigster Preis', value: `**${formatCurrency(minPrice)}**`, inline: true },
                    { name: '📈 Höchster Preis', value: `**${formatCurrency(maxPrice)}**`, inline: true },
                    { name: '📊 Preisdifferenz', value: `**${formatCurrency(maxPrice - minPrice)}**`, inline: true },
                    { name: '📈 Varianz', value: `${((maxPrice - minPrice) / average * 100).toFixed(1)}%`, inline: true },
                    { name: '📋 Gesamte Einträge', value: `**${rows.length}**`, inline: true }
                )
                .setFooter({ text: 'GTA V Grand RP • Strandmarkt Bot' })
                .setTimestamp();

            interaction.followUp({ embeds: [embed] });
        }
    );
}

// Error Handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);
