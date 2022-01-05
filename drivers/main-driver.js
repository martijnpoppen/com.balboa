const Homey = require('homey');
const Balboa = require('../lib/balboa');
const { encrypt, mapName } = require('../lib/helpers');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    deviceType() {
        return 'other';
    }

    async onPair(session) {
        session.setHandler("login", async (data) => {
            try {
                this.config = {
                    username: data.username,
                    password: data.password
                };


                this.homey.app.log(`[Driver] ${this.id} - got config`, this.config);
    
                this._balboaClient = await new Balboa(this.config.username, this.config.password);
                
                this.balboaData = await this._balboaClient.init();
            } catch (error) {
                console.log(error);
                throw new Error(this.homey.__('pair.error'));
            }
        });

        session.setHandler("list_devices", async () => {
            this.results = [];
            this.homey.app.log(`[Driver] ${this.id} - this.balboaData`, this.balboaData);


            this.results.push({
                name: this.balboaData.model,
                data: {
                    id: this.balboaData.oemId,
                },
                settings: {
                    ...this.config,
                    username: this.config.username,
                    password: encrypt(this.config.password)
                }
            });

            this.homey.app.log(`[Driver] ${this.id} - Found devices - `, this.results);

            return this.results;
        });
    }
}