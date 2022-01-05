const Homey = require('homey');
const ControlMySpa = require('../lib/balboa');
const { sleep, decrypt, encrypt} = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        try {
            this.homey.app.log('[Device] - init =>', this.getName());
            this.setUnavailable(`Initializing ${this.getName()}`);

            await this.checkCapabilities();
            await this.setCapabilityListeners();            
            await this.setControlMySpaClient();

            await this.setAvailable();
        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - OnInit Error`, error);
        }
    }

    // ------------- Settings -------------
    async onSettings({ oldSettings, newSettings, changedKeys }) {
        this.homey.app.log(`[Device] ${this.getName()} - oldSettings`, {...oldSettings, username: 'LOG', password: 'LOG'});
        this.homey.app.log(`[Device] ${this.getName()} - newSettings`, {...newSettings, username: 'LOG', password: 'LOG'});

        if(changedKeys.length) {
            if(this.onPollInterval) {
                this.clearIntervals();
            }

            if(newSettings.password !== oldSettings.password) {
                await this.setControlMySpaClient({...newSettings, password: encrypt(newSettings.password)});
            } else {
                await this.setControlMySpaClient(newSettings);
            }

            if(newSettings.password !== oldSettings.password) {
                this.savePassword(newSettings, 2000);
            }
        }
    }

    async savePassword(settings, delay = 0) {
        this.homey.app.log(`[Device] ${this.getName()} - savePassword - encrypted`);
        
        if(delay > 0) {
            await sleep(delay);
        }

        await this.setSettings({...settings, password: encrypt(settings.password)});
    }
    

    // ------------- API -------------
    async setControlMySpaClient(overrideSettings = null) {
        const settings = overrideSettings ? overrideSettings : this.getSettings();

        try {
            this.config = {...settings, password: decrypt(settings.password)};

            this.homey.app.log(`[Device] - ${this.getName()} => setControlMySpaClient Got config`, {...this.config, username: 'LOG', password: 'LOG'});
            
            this._controlMySpaClient = await new ControlMySpa(this.config.username, this.config.password);
            
            await this._controlMySpaClient.deviceInit();

            await this.setCapabilityValues();
            await this.setAvailable();
            await this.setIntervalsAndFlows(settings);

        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - setControlMySpaClient - error =>`, error);

            if(settings.sso === false) {
                this.homey.app.log(`[Device] ${this.getName()} - setControlMySpaClient - need_admin`);
                await this.setUnavailable(this.homey.__("amber.need_admin"));
            }
        }
    }

    // ------------- CapabilityListeners -------------
    async setCapabilityListeners() {
        await this.registerCapabilityListener('locked', this.onCapability_LOCKED.bind(this));
        await this.registerCapabilityListener('target_temperature', this.onCapability_TEMPERATURE.bind(this));
        await this.registerMultipleCapabilityListener(["action_pump_state", "action_light_state", "action_blower_state", "action_heater_mode"], this.onCapability_ACTION.bind(this));
        
        // await this.registerCapabilityListener('action_update_data', this.onCapability_UPDATE_DATA.bind(this));
    }

    async onCapability_TEMPERATURE(value) {
        try {
            this.homey.app.log(`[Device] ${this.getName()} - onCapability_TEMPERATURE`, value);
 
            await this._controlMySpaClient.setTemp(value);
 
             return Promise.resolve(true);
         } catch (e) {
             this.homey.app.error(e);
             return Promise.reject(e);
         }
    }


    async onCapability_LOCKED(value) {
        try {
            this.homey.app.log(`[Device] ${this.getName()} - onCapability_LOCKED`, value);

            if(value) {
                await this._controlMySpaClient.lockPanel();
            } else {
                await this._controlMySpaClient.unlockPanel();
            }

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

    async onCapability_ACTION(value) {
        try {
            this.homey.app.log(`[Device] ${this.getName()} - onCapability_TEMPERATURE`, value);
 
            if('action_blower_state' in value) {
                const valueString = value.action_blower_state ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setBlowerState(0, valueString);
            }

            if('action_light_state' in value) {
                const valueString = value.action_light_state ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setLightState(0, valueString);
            }

            if('action_jet_state' in value) {
                const valueString = value.action_jet_state ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setJetState(0, valueString);   
            }

            if('action_heater_mode' in value) {
                await this._controlMySpaClient.toggleHeaterMode();
            }
 
             return Promise.resolve(true);
         } catch (e) {
             this.homey.app.error(e);
             return Promise.reject(e);
         }
    }

    async onCapability_UPDATE_DATA(value) {
        try {
           this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPDATE_DATA`, value);

           await this.setCapabilityValues();

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

   
    async setCapabilityValues() {
        this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues`);

        try { 
            const deviceInfo = await this._controlMySpaClient.getSpa();
            const {currentState} = deviceInfo;
            let {targetDesiredTemp, currentTemp, panelLock, heaterMode, components} = currentState
            
            const light = await this.getComponent('LIGHT', components);
            const pump = await this.getComponent('PUMP', components);
            const blower = await this.getComponent('BLOWER', components);

            this.homey.app.log(`[Device] ${this.getName()} - deviceInfo =>`, currentState);
                    
            await this.setCapabilityValue('locked', panelLock);
            await this.setCapabilityValue('action_pump_state', pump);
            await this.setCapabilityValue('action_light_state', light);
            await this.setCapabilityValue('action_blower_state', blower);
            await this.setCapabilityValue('action_heater_mode', heaterMode === 'READY');
           
            if(currentTemp) await this.setCapabilityValue('measure_temperature', parseFloat(currentTemp) > 40 ? 40 : parseFloat(currentTemp));
            if(targetDesiredTemp) await this.setCapabilityValue('target_temperature', parseFloat(targetDesiredTemp) > 40 ? 40 : parseFloat(targetDesiredTemp));
        } catch (error) {
            this.homey.app.log(error);
        }
    }

    async getComponent(val, components) {
        const comp = components.find((el, id) => el.componentType === val);
        if(comp) {
            return comp.value === 'HIGH'
        }

        return false;
    }

    // ------------- Intervals -------------
    async setIntervalsAndFlows(settings) {
        try {
            if(this.getAvailable()) {
                await this.setCapabilityValuesInterval(settings.update_interval);
            }
        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - OnInit Error`, error);
        }
    }

    async setCapabilityValuesInterval(update_interval) {
        try {  
            const REFRESH_INTERVAL = 1000 * update_interval;

            this.homey.app.log(`[Device] ${this.getName()} - onPollInterval =>`, REFRESH_INTERVAL, update_interval);
            this.onPollInterval = setInterval(this.setCapabilityValues.bind(this), REFRESH_INTERVAL);
        } catch (error) {
            this.setUnavailable(error)
            this.homey.app.log(error);
        }
    }

    async clearIntervals() {
        this.homey.app.log(`[Device] ${this.getName()} - clearIntervals`);
        await clearInterval(this.onPollInterval);
    }


    // ------------- Capabilities -------------
    async checkCapabilities() {
        const driverManifest = this.driver.manifest;
        const driverCapabilities = driverManifest.capabilities;
        
        const deviceCapabilities = this.getCapabilities();

        this.homey.app.log(`[Device] ${this.getName()} - Found capabilities =>`, deviceCapabilities);
        this.homey.app.log(`[Device] ${this.getName()} - Driver capabilities =>`, driverCapabilities);
        
        if(deviceCapabilities.length !== driverCapabilities.length) {      
            await this.updateCapabilities(driverCapabilities, deviceCapabilities);
        }

        return deviceCapabilities;
    }

    async updateCapabilities(driverCapabilities, deviceCapabilities) {
        this.homey.app.log(`[Device] ${this.getName()} - Add new capabilities =>`, driverCapabilities);
        try {
            deviceCapabilities.forEach(c => {
                this.removeCapability(c);
            });
            await sleep(2000);
            driverCapabilities.forEach(c => {
                this.addCapability(c);
            });
            await sleep(2000);
        } catch (error) {
            this.homey.app.log(error)
        }
    }

    onDeleted() {
        this.clearIntervals();
    }
}