"use strict";

const Homey = require("homey");
const flowActions = require('./lib/flows/actions');
const flowConditions = require('./lib/flows/conditions');

class App extends Homey.App {
  log() {
    console.log.bind(this, "[log]").apply(this, arguments);
  }

  error() {
    console.error.bind(this, "[error]").apply(this, arguments);
  }

  // -------------------- INIT ----------------------

  async onInit() {
    this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);

    await flowActions.init(this.homey);
    await flowConditions.init(this.homey);
  }
}

module.exports = App;
