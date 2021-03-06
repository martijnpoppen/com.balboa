const Homey = require('homey');
const ControlMySpa = require('../lib/balboa');
const { sleep, decrypt, encrypt} = require('../lib/helpers');

module.exports = class mainDevice extends Homey.Device {
    async onInit() {
        try {
            this.homey.app.log('[Device] - init =>', this.getName());
            this.setUnavailable(`Initializing ${this.getName()}`);

            await this.checkCapabilities();            
            await this.setControlMySpaClient();
            await this.setCapabilityListeners();

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

            await this.setCapabilityValues(true);
            await this.setAvailable();
            await this.setIntervalsAndFlows(settings);

        } catch (error) {
            this.homey.app.log(`[Device] ${this.getName()} - setControlMySpaClient - error =>`, error);
        }
    }


    async resetControlMySpaClient() {
        await this._controlMySpaClient.deviceInit();
    }

    // ------------- CapabilityListeners -------------
    async setCapabilityListeners() {
        await this.registerCapabilityListener('locked', this.onCapability_LOCKED.bind(this));
        await this.registerCapabilityListener('target_temperature', this.onCapability_TEMPERATURE.bind(this));
        await this.registerCapabilityListener('action_update_data', this.onCapability_UPDATE_DATA.bind(this));
        await this.registerMultipleCapabilityListener(["action_pump_state", "action_pump_state.1", "action_pump_state.2", "action_light_state", "action_blower_state", "action_blower_state.1", "action_blower_state.2", "action_heater_mode", "action_temp_range"], this.onCapability_ACTION.bind(this));
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
            this.homey.app.log(`[Device] ${this.getName()} - onCapability_ACTION`, value);
 
            if('action_blower_state' in value) {
                const valueString = value.action_blower_state ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setBlowerState(0, valueString);
            }

            if('action_blower_state.1' in value) {
                const valueString = value['action_blower_state.1'] ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setBlowerState(1, valueString);
            }

            if('action_blower_state.2' in value) {
                const valueString = value['action_blower_state.2'] ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setBlowerState(2, valueString);
            }

            if('action_light_state' in value) {
                const valueString = value.action_light_state ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setLightState(0, valueString);
            }

            if('action_pump_state' in value) {
                const valueString = value.action_pump_state ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setJetState(0, valueString);   
            }

            if('action_pump_state.1' in value) {
                const valueString = value['action_pump_state.1'] ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setJetState(1, valueString);   
            }

            if('action_pump_state.2' in value) {
                const valueString = value['action_pump_state.2'] ? 'HIGH' : 'OFF';
                await this._controlMySpaClient.setJetState(2, valueString);   
            }

            if('action_heater_mode' in value) {
                await this._controlMySpaClient.toggleHeaterMode();
            }

            if('action_temp_range' in value) {
                await this._controlMySpaClient.setTempRange(value.action_pump_state);   
            }

            await this.setCapabilityValues();
 
             return Promise.resolve(true);
         } catch (e) {
             this.homey.app.error(e);
             return Promise.reject(e);
         }
    }

    async onCapability_UPDATE_DATA(value) {
        try {
           this.homey.app.log(`[Device] ${this.getName()} - onCapability_UPDATE_DATA`, value);

           this.setCapabilityValue('action_update_data', false);

           await this.setCapabilityValues();

            return Promise.resolve(true);
        } catch (e) {
            this.homey.app.error(e);
            return Promise.reject(e);
        }
    }

   
    async setCapabilityValues(check = false) {
        this.homey.app.log(`[Device] ${this.getName()} - setCapabilityValues`);

        try { 
            const settings = this.getSettings()
            const deviceInfo = await this._controlMySpaClient.getSpa();
            const {currentState} = deviceInfo;
            let {targetDesiredTemp, desiredTemp, currentTemp, panelLock, heaterMode, components, runMode, online, tempRange} = currentState

            this.homey.app.log(`[Device] ${this.getName()} - deviceInfo =>`, currentState);

            // Check for existence
            const pump0 = await this.getComponent('PUMP', components, '0');
            const pump1 = await this.getComponent('PUMP', components, '1');
            const pump2 = await this.getComponent('PUMP', components, '2');
            const blower0 = await this.getComponent('BLOWER', components, '0');
            const blower1 = await this.getComponent('BLOWER', components, '1');
            const blower2 = await this.getComponent('BLOWER', components, '2');

            if(check) {
                if(pump0) await this.addCapability('action_pump_state');
                if(pump1) await this.addCapability('action_pump_state.1');
                if(pump2) await this.addCapability('action_pump_state.2');
                if(blower0) await this.addCapability('action_blower_state');
                if(blower1) await this.addCapability('action_blower_state.1');
                if(blower2) await this.addCapability('action_blower_state.2');
            }
            
            // ------------ Get values --------------      
            const light = await this.getComponentValue('LIGHT', components);
            const heater = heaterMode === 'READY';
            const tempranges = tempRange === 'HIGH'
      
            if(pump0) {
                const pump0_val = pump0.value === 'HIGH';
                await this.setCapabilityValue('action_pump_state', pump0_val);
            }
            if(pump1) {
                const pump1_val = pump1.value === 'HIGH';
                await this.setCapabilityValue('action_pump_state.1', pump1_val);
            }
            if(pump2) {
                const pump2_val = pump2.value === 'HIGH';
                await this.setCapabilityValue('action_pump_state.2', pump2_val);
            }
            if(blower0) {
                const blower0_val = blower0.value === 'HIGH';
                await this.setCapabilityValue('action_blower_state', blower0_val);
            }
            if(blower1) {
                const blower1_val = blower1.value === 'HIGH';
                await this.setCapabilityValue('action_blower_state.1', blower1_val);
            }
            if(blower2) {
                const blower2_val = blower2.value === 'HIGH';
                await this.setCapabilityValue('action_blower_state.2', blower2_val);
            }

            await this.setCapabilityValue('action_update_data', false);
            await this.setCapabilityValue('locked', panelLock);
            await this.setCapabilityValue('action_light_state', light);
            await this.setCapabilityValue('action_heater_mode', heater);
            await this.setCapabilityValue('action_temp_range', tempranges);
            await this.setCapabilityValue('measure_temperature_range', tempRange);
            await this.setCapabilityValue('measure_heater_mode', heaterMode);
            await this.setCapabilityValue('measure_online', online);
            await this.setCapabilityValue('measure_runmode', runMode === 'Ready');
           
            if(settings.round_temp) {
                if(currentTemp) await this.setCapabilityValue('measure_temperature', Math.round(parseFloat(currentTemp)) > 40 ? 40 : Math.round(parseFloat(currentTemp)));
                if(heater && targetDesiredTemp) await this.setCapabilityValue('target_temperature',  Math.round(parseFloat(targetDesiredTemp)) > 40 ? 40 :  Math.round(parseFloat(targetDesiredTemp)));
                if(!heater && desiredTemp) await this.setCapabilityValue('target_temperature',  Math.round(parseFloat(desiredTemp)) > 40 ? 40 :  Math.round(parseFloat(desiredTemp)));
            } else {
                if(currentTemp) await this.setCapabilityValue('measure_temperature', parseFloat(currentTemp) > 40 ? 40 : parseFloat(currentTemp));
                if(tempranges && targetDesiredTemp) await this.setCapabilityValue('target_temperature', parseFloat(targetDesiredTemp) > 40 ? 40 : parseFloat(targetDesiredTemp));
                if(!tempranges && desiredTemp) await this.setCapabilityValue('target_temperature', parseFloat(desiredTemp) > 40 ? 40 : parseFloat(desiredTemp));
            }
          
        } catch (error) {
            await this.setCapabilityValue('measure_online', false);
            await this.resetControlMySpaClient();
            this.homey.app.error(error);
        }
    }

    async getComponent(val, components, index = null) {
        return components.find((el, id) => el.componentType === val && el.port === index);
    }

    async getComponentValue(val, components) {
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