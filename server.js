const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const config = require('./config.json')

const accountSid = config['accountSid']
const authToken = config['authToken']
const client = require('twilio')(accountSid, authToken);

const PORT = process.env.PORT || 3000

app.post('/sms', function(req, res) {
    console.log('---------------MESSAGE RECEIVED-----------------')

    console.log(req.body)
})

app.listen(PORT, () => {
    console.log(`Our app is running on port ${ PORT }`);
})
