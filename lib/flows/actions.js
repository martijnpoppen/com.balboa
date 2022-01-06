exports.init = async function (homey) {
    const action_pump_state = homey.flow.getActionCard('action_pump_state_flow');
    action_pump_state.registerRunListener(async (args, state) => {
        await args.device.onCapability_ACTION({'action_pump_state': !!parseInt(args.action_on_off)});
    });

    const action_light_state = homey.flow.getActionCard('action_light_state_flow');
    action_light_state.registerRunListener(async (args, state) => {
        await args.device.onCapability_ACTION({'action_light_state': !!parseInt(args.action_on_off)});
    });

    const action_blower_state = homey.flow.getActionCard('action_blower_state_flow');
    action_blower_state.registerRunListener(async (args, state) => {
        await args.device.onCapability_ACTION({'action_blower_state': !!parseInt(args.action_on_off)});
    });

    const action_heater_mode = homey.flow.getActionCard('action_heater_mode_flow');
    action_heater_mode.registerRunListener(async (args, state) => {
        await args.device.onCapability_ACTION({'action_heater_mode': !!parseInt(args.action_on_off)});
    });
};