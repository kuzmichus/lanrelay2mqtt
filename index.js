const express = require('express')
const mqtt = require('mqtt')
const { exec } = require("child_process");

const util = require('util');
const _exec = util.promisify(require('child_process').exec);

//const logger = require('./lib/logger');

const infoDevice = (hardwareVersion, softwareVersion, model, number) => {
  return {
    hardwareVersion: hardwareVersion,
    softwareVersion: softwareVersion,
    model: model,
    number: number
  }
}

const switchEndpoint = (endpointName) => {
    return {
        type: 'switch',
        object_id: `switch_${endpointName}`,
        discovery_payload: {
            payload_off: 'OFF',
            payload_on: 'ON',
            value_template: `{{ value_json.state_${endpointName} }}`,
            command_topic: true,
            command_topic_prefix: endpointName,
        },
    };
};

async function aexec(params) {
  const { stdout, stderr } = await _exec(params);
  return stdout;
}

const devices = {
  'IOT RELAY-4': {
    init: async (ip) => {
      const url = `http://${ip}/main.cgi?cur_time=` + Date.now();
      let ret = await aexec('/usr/bin/curl "' + url + '"');
      const info = ret.split('&');
      return infoDevice(info[1], info[2], info[3], info[4])
    },
    state: async (ip) => {
      const url = `http://${ip}/relay_cgi_load.cgi?` + Date.now();
      const ret = await aexec('/usr/bin/curl "' + url + '"');
      const state = ret.split('&');
      return [state[3], state[4], state[5], state[6]]
    },
    set: async (ip, relay, state) => {
      const url = `http://${ip}/relay_cgi.cgi?type=0&relay=${relay}&on=${state}&time=0&pwd=0&` + Date.now();
      const ret = await aexec('/usr/bin/curl "' + url + '"');
      const _ret = ret.split('&');
      return _ret[4]
    }
  }
}

const mapping = {
  'IOT RELAY-4': [switchEndpoint('relay_1'), switchEndpoint('relay_2'), switchEndpoint('relay_3'), switchEndpoint('relay_4')]
}

async function m(){
  //console.log(await devices['IOT RELAY-4'].init('192.168.1.231'));
  //console.log(await devices['IOT RELAY-4'].state('192.168.1.231'));
  console.log(await devices['IOT RELAY-4'].set('192.168.1.231', 0, 1));
}

//m();


const config = {
  base_topic: 'lanrelay2mqtt',
  discovery_prefix: 'homeassistant',
  time: 15,
  relay_list: [
    '192.168.1.231'
  ],
  reset_topic: [
    '/ParenLight1/rcdata'
  ]
}

const client  = mqtt.connect('mqtt://192.168.1.1')


client.on('connect', () => {
  client.publish(config.base_topic + '/state', 'online')
  for(let ind = 0; ind<config.relay_list.length; ind++) {
    const server = config.relay_list[ind]
    load_state(server);
    setInterval(load_state, config.time*1000, server);

    init_object(server);
    setInterval(init_object, 60*60*1000, server);


  }

  for (let i in config.reset_topic) {
    client.subscribe(config.reset_topic[i])
  }

})

client.on('offline', () => {
  //client.publish(config.base_topic + '/state', 'offline')
})

client.on('message', function (topic, message) {
  // message is Buffer
  const path = topic.split('/');

  if (config.reset_topic.indexOf(topic) > -1 && '0' != message.toString()) {
    setTimeout(() => client.publish(topic, null), 1000);
  }  else  if ('set' == path[3]) {
    let server = path[1].split('_').join('.');
    [tmp, rally] = path[2].split('_');
    rally = parseInt(rally) - 1;
    let state = 'ON'==message.toString()?1:0;

    let url = 'http://' + server + '/relay_cgi.cgi?type=0&relay=' + rally + '&on=' + state + '&time=0&pwd=0&';

    let answer = {}
    exec('/usr/bin/curl "'+ url +'"', (error, stdout, stderr) => {
        answer['state_relay_' + (parseInt(rally) + 1)] = stdout.split('&')[4]=='1'?'ON':'OFF';
        client.publish(config.base_topic + '/' + path[1], JSON.stringify(answer))
    });
  }


})

async function load_state(server) {
  const state = await devices['IOT RELAY-4'].state('192.168.1.231')
  const relay_name = server.split('.').join('_');

  let answer = {}
  for (let relay in state) {
    let channel = parseInt(relay) + 1
    answer['state_relay_' + channel] = state[relay] =='1'?'ON':'OFF';
    client.subscribe('lanrelay2mqtt/' + relay_name + '/relay_' + channel + '/set')
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     }
  client.publish(config.base_topic + '/' + relay_name, JSON.stringify(answer))
}

async function init_object(server) {
  const info = await devices['IOT RELAY-4'].init('192.168.1.231');
  const state = await devices['IOT RELAY-4'].state('192.168.1.231')
  const relay_name = server.split('.').join('_');


  for (let relay in state) {
    let channel = parseInt(relay) + 1;
    let answer = {}
    answer = {
      "payload_off":"OFF",
      "payload_on":"ON",
      "state_on": "ON",
      "state_off": "OFF",
      "value_template":"{{ value_json.state_relay_" + channel + " }}",
      "command_topic":config.base_topic + '/' + channel + '/relay_' + channel + '/set',
      "state_topic":config.base_topic + "/" + channel ,
      "json_attributes_topic":config.base_topic +"/" + channel,
      "name":relay_name + "_switch_relay_" + channel,
      "unique_id":relay_name + "_switch_relay_" + channel + "_lanrelay2mqtt",
      "device":{
        "identifiers":["lanrelay2mqtt_" + relay_name],
        "name":relay_name,
        "sw_version":"LanRelay2mqtt 0.1.0",
        "model":info['model'],
          "manufacturer":"Custom devices (DiY)"
        },
      "availability_topic": config.base_topic + '/state'
      }
      client.publish(config.discovery_prefix + '/switch/' + relay_name + '/switch_relay_' + channel + '/config', JSON.stringify(answer))
  }

}
