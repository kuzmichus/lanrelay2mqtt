const express = require('express')
const mqtt = require('mqtt')
const { exec } = require("child_process");




const config = {
  base_topic: 'lanrelay2mqtt',
  discovery_prefix: 'homeassistant',
  time: 15,
  relay_list: [
    '192.168.1.231'
  ]
}

const client  = mqtt.connect('mqtt://192.168.1.10')


client.on('connect', () => {
  client.publish(config.base_topic + '/state', 'online')
  for(let ind = 0; ind<config.relay_list.length; ind++) {
    const server = config.relay_list[ind]
    load_state(server);
    setInterval(load_state, config.time*1000, server);

    init_object(server);
    setInterval(init_object, 60*60*1000, server);


  }

})

client.on('offline', () => {
  //client.publish(config.base_topic + '/state', 'offline')
})

client.on('message', function (topic, message) {
  // message is Buffer
  const path = topic.split('/');

if ('set' == path[3]) {
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

function load_state(server) {
  exec('/usr/bin/curl "http://'+ server + '/relay_cgi_load.cgi"', (error, stdout, stderr) => {
    const response = stdout.split('&');
    const relay_name = server.split('.').join('_');

    let answer = {}
    for (let i = 1; i<parseInt(response[2]) + 1; i++) {
      answer['state_relay_' + i] = response[i+2]=='1'?'ON':'OFF';

      client.subscribe('lanrelay2mqtt/' + relay_name + '/relay_' + i + '/set')
    }
    client.publish(config.base_topic + '/' + relay_name, JSON.stringify(answer))
  });
}

function init_object(server) {
  exec('/usr/bin/curl "http://'+ server + '/relay_cgi_load.cgi"', (error, stdout, stderr) => {
    const response = stdout.split('&');
    const relay_name = server.split('.').join('_');

    for (let i = 1; i<parseInt(response[2]) + 1; i++) {
      let answer = {}
      answer = {
        "payload_off":"OFF",
        "payload_on":"ON",
        "state_on": "ON",
        "state_off": "OFF",
        "value_template":"{{ value_json.state_relay_" + i + " }}",
        "command_topic":config.base_topic + '/' + relay_name + '/relay_' + i + '/set',
        "state_topic":config.base_topic + "/" + relay_name ,
        "json_attributes_topic":config.base_topic +"/" + relay_name,
        "name":relay_name + "_switch_relay_" + i,
        "unique_id":relay_name + "_switch_relay_" + i + "_lanrelay2mqtt",
        "device":{
          "identifiers":["lanrelay2mqtt_" + relay_name],
          "name":relay_name,
          "sw_version":"LanRelay2mqtt 0.1.0",
          "model":"[Multi-channel lan relay switch]",
            "manufacturer":"Custom devices (DiY)"
          },
        "availability_topic": config.base_topic + '/state'
        }
        client.publish(config.discovery_prefix + '/switch/' + relay_name + '/switch_relay_' + i + '/config', JSON.stringify(answer))
    }

  })
}

