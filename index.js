const SteamUser = require('steam-user');
const TradeOfferManager = require('steam-tradeoffer-manager');

const crypto = require("crypto");

const Config = require('./config/config.json');
const TRADE_DESTINATION = Config.trade_destination;
const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

class CardMover {
    /** @type {CardMover} */
    static #instance

    /** @type {SteamUser} */
    #steamClient

    /** @type {TradeOfferManager} */
    #tradeManagerClient

    /** @type {string} */
    #username

    constructor(data) {
        this.end = false;
        this.#username = data.account;
        this.#steamClient = new SteamUser();
        this.#tradeManagerClient = new TradeOfferManager({
            "steam": this.#steamClient,
            "domain": "example.com",
            'useAccessToken': true,
            "language": "en"
        });
        this.#steamClient.logOn({
            accountName: this.#username,
            password: data.password,
            clientOS: SteamUser.EOSType.MacOSUnknown,
            machineName: crypto.randomBytes(10).toString('hex'),
        });
        this.#steamClient.on('loggedOn', this.#onSteamLoggedOn.bind(this));
        this.#steamClient.on('disconnected', this.#onSteamDisconnected.bind(this));
        this.#steamClient.on('webSession', this.#onSteamWebSession.bind(this));

        console.log(`[${this.#username}] Constructor called`);
    }

    static getInstance(data) {
        if (!this.#instance) {
            this.#instance = new CardMover(data);
        }

        return this.#instance;
    }

    static destroy() {
        if (this.#instance) {
            console.log(`[${this.#instance.#username}] Destructor called`);
            this.#instance = null;
        }
    }

    logOff() {
        return new Promise((resolve) => {
            this.#steamClient.logOff();
            console.log(`[${this.#username}] Logoff!`);
            resolve(true);
        });
    }

    #onSteamLoggedOn(details) {
        if (details.eresult === SteamUser.EResult.OK) {
            console.log(`[${this.#username}] Logged into Steam as ${this.#steamClient.steamID?.getSteam3RenderedID()}`)
            this.#steamClient.setUIMode(SteamUser.EClientUIMode.BigPicture);
            this.#steamClient.setPersona(SteamUser.EPersonaState.Invisible);
        }
    }

    #onSteamDisconnected(eresult, msg) {
        console.log(`[${this.#username}] Steam disconnected: ${msg}`)
    }

    #onSteamWebSession(sessionID, cookies) {
        let currentClass = this;
        currentClass.#tradeManagerClient.setCookies(cookies, function (err) {
            if (err) {
                currentClass.end = true;
                console.log(err);
                return;
            }

            console.log(`[${currentClass.#username}] Trade manager client cookies set`);

            currentClass.#tradeManagerClient.getInventoryContents(753, 6, false, function (err, inventory) {
                if (!err) {
                    let my_inv = inventory.filter((ITEM) => ITEM.getTag("item_class").internal_name == "item_class_2" && ITEM.getTag("Event").internal_name == 'summersale2024');
                    // console.log(my_inv)
                    if (my_inv.length == 0) {
                        currentClass.end = true;
                        console.log(`[${currentClass.#username}] No desired trading card found!`);
                        return;
                    }

                    console.log(`[${currentClass.#username}] Found ${my_inv.length} summer sale 2024 trading card(s).`);

                    let offer = currentClass.#tradeManagerClient.createOffer(TRADE_DESTINATION);
                    offer.addMyItems(my_inv);
                    offer.setMessage(`#${crypto.randomBytes(5).toString('hex')} Here, have some items!`);
                    offer.send(function (err, status) {
                        if (err) {
                            currentClass.end = true;
                            console.log(err);
                            return;
                        }

                        if (status == 'pending') {
                            console.log(`[${currentClass.#username}] Offer #${offer.id} sent, but requires confirmation`);
                        } else {
                            console.log(`[${currentClass.#username}] Offer #${offer.id} sent successfully`);
                        }
                        currentClass.end = true;
                    });
                }
            });
        });
    }
}

(async () => {
    try {
        for (let user of Config.accounts) {
            await getClient(user);
            await sleep(10_000);
        }
    }
    catch (err) {
        console.error(err.message);
    }
    process.exit(0);
})();

function getClient(data) {
    return new Promise(resolve => {
        const bot = CardMover.getInstance(data);
        const timer = setInterval(() => {
            if (bot.end) {
                Promise.all([
                    bot.logOff(),
                ]).then(() => {
                    CardMover.destroy();
                    clearInterval(timer);
                    resolve();
                });
            }
        }, 250);
    });
}