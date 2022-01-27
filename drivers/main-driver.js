const Homey = require('homey');
const ControlMySpa = require('../lib/balboa');
const { encrypt } = require('../lib/helpers');

module.exports = class mainDriver extends Homey.Driver {
    onInit() {
        this.homey.app.log('[Driver] - init', this.id);
        this.homey.app.log(`[Driver] - version`, Homey.manifest.version);
    }

    async onPair(session) {
        session.setHandler("login", async (data) => {
            try {
                this.config = {
                    username: data.username,
                    password: data.password
                };


                this.homey.app.log(`[Driver] ${this.id} - got config`, this.config);
    
                this._controlMySpaClient = await new ControlMySpa(this.config.username, this.config.password);
                
                this.balboaData = await this._controlMySpaClient.init();
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