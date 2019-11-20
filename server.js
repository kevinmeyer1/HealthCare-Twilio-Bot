const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const config = require('./config.json')

const accountSid = config['accountSid']
const authToken = config['authToken']
const client = require('twilio')(accountSid, authToken);

const AWS = require("aws-sdk");
AWS.config.loadFromPath('./aws-config.json');

var ddb = new AWS.DynamoDB();

const PORT = process.env.PORT || 3000

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
    extended: false
}))

function sendMessage(textMessage, toNumber, fromNumber, callback) {
    client.messages.create({
        body: textMessage,
        to: toNumber,
        from: fromNumber
    }).then(function(message) {
        console.log(`Message send to ${toNumber}`)
        callback()
    })
}

function addNumber(number, callback) {
    var params = {
      TableName: 'Messages',
      Item: {
        'number' : {S: number}
      }
    };

    ddb.putItem(params, function(err, data) {
      if (err) {
        console.log("Error", err);
      } else {
        callback()
      }
    });
}

function increaseTimes(number, callback) {
    var params = {
        TableName: 'Messages',
        Key: {
            'number': {
                S: number
            }
        }
    };

    ddb.getItem(params, function(err, data) {
        if (JSON.stringify(data).includes("count")) {
            var countString = data.Item['count']['S']
            var count = Number(countString)
            count += 1

            if (count == 3) {
                return callback(true)
            }

            var countParams = {
                TableName: 'Messages',
                Item: {
                  'number' : {S: number},
                  'count': {S: count.toString()}
                }
            }

            ddb.putItem(countParams, function(err, data) {
              if (err) {
                console.log("Error", err);
              } else {
                return callback(false)
              }
          });
        } else {
            var countParams = {
              TableName: 'Messages',
              Item: {
                'number' : {S: number},
                'count': {S: '1'}
              }
            }

            ddb.putItem(countParams, function(err, data) {
              if (err) {
                console.log("Error", err);
              } else {
                return callback(false)
              }
          });
        }
    })
}

function addFirstValue(number, value, callback) {
    var params = {
        TableName: 'Messages',
        Key: {
            'number': {
                S: number
            }
        }
    };

    ddb.getItem(params, function(err, data) {
        if (JSON.stringify(data).includes("count")) {
            var count = data.Item['count']['S']

            var addParams = {
              TableName: 'Messages',
              Item: {
                'number' : {S: number},
                'firstValue': {S: value},
                'count': {S: count}
              }
            };

            ddb.putItem(addParams, function(err, data) {
                if (err) {
                  console.log("Error", err);
                } else {
                  callback()
                }
            });
        } else {
          var addParams = {
            TableName: 'Messages',
            Item: {
              'number' : {S: number},
              'firstValue': {S: value}
            }
          };

          ddb.putItem(addParams, function(err, data) {
              if (err) {
                console.log("Error", err);
              } else {
                callback()
              }
          });
        }
    })
}

function sendDiagnosis(text, number, botNumber, firstValue) {
    if (text == "1" || text == "2") {
        sendMessage(`You have a mild ${firstValue}`, number, botNumber)
    } else if (text == "3") {
        sendMessage(`You have a moderate ${firstValue}`, number, botNumber)
    } else if (text == "4") {
        sendMessage(`You have a severe ${firstValue}`, number, botNumber)
    } else if (text == "0") {
        sendMessage(`You do not have ${firstValue}`, number, botNumber)
    }
}

function removeNumber(number) {
    var params = {
      TableName: 'Messages',
      Key: {
        'number' : {S: number}
      }
    };

    ddb.deleteItem(params, function(err, data) {
      if (err) {
        console.log("Error", err);
      }
    });
}

app.post('/sms', function(req, res) {
    var number = req.body.From
    var botNumber = req.body.To
    var text = req.body.Body

    var symptoms = ["", "Headache", "Dizziness", "Nausea", "Fatigue", "Sadness"]

    if (text == "START") {
        //check for number
        var params = {
            TableName: 'Messages',
            Key: {
                'number': {
                    S: number
                }
            }
        };

        ddb.getItem(params, function(err, data) {
            if (err) {
                console.log("Error", err);
            } else {
                if (JSON.stringify(data) == '{}') {
                    //number does not exist
                    sendMessage("Welcome to the study", number, botNumber, function() {
                        sendMessage("Please indicate your symptom (1)Headache, (2)Dizziness, (3)Nausea, (4)Fatigue, (5)Sadness, (0)None", number, botNumber)
                    })

                    addNumber(number, function() {
                        console.log('Number added')
                    })

                    res.status(200)
                    res.setHeader('Content-Type', 'text/plain')
                    //res.write(`New number (${number}) has started the study`)
                    res.send()
                } else {
                    //number exists
                    sendMessage("Please enter a number from 0 to 4", number, botNumber)
                    res.status(401)
                    res.setHeader('Content-Type', 'text/plain')
                    //res.write(`Number (${number}) has already started the study`)
                    res.send()
                }
            }
        });
    } else if (text == "remove") {
        removeNumber(number)
        res.status(200)
        res.setHeader('Content-Type', 'text/plain')
        //res.write(`Number (${number}) has been removed from the db`)
        res.send()
    } else {
        //text message is not a start so it must be a number
        var params = {
            TableName: 'Messages',
            Key: {
                'number': {
                    S: number
                }
            }
        };

        ddb.getItem(params, function(err, data) {
            if (err) {
                console.log("Error", err);
            } else {
                if (JSON.stringify(data) == "{}") {
                    sendMessage("Text 'START' to begin the study", number, botNumber)
                    res.status(200)
                    res.setHeader('Content-Type', 'text/plain')
                    //res.write(`Number (${number}) entered values without starting the study`)
                    return res.send()
                }

                if (JSON.stringify(data).includes("firstValue")) {
                    //the first item is in the string so they are responding to the second question
                    var acceptedValues = ['0', '1', '2', '3', '4']

                    if (!acceptedValues.includes(text)) {
                        sendMessage("Please enter a number from 0 to 4", number, botNumber)
                        res.status(401)
                        res.setHeader('Content-Type', 'text/plain')
                        //res.write(`Number (${number}) responded with a value that is not acceptable`)
                        return res.send()
                    }

                    var firstValue = data.Item['firstValue']['S']
                    var numFirstValue = Number(firstValue)
                    var firstSymptom = symptoms[numFirstValue]

                    sendDiagnosis(text, number, botNumber, firstSymptom)

                    increaseTimes(number, function(hitThree) {
                        if (hitThree == true) {
                            sendMessage("Thank you and see you soon", number, botNumber, function() {
                                res.status(200)
                                res.setHeader('Content-Type', 'text/plain')
                                //res.write(`Number (${number}) was given a diagnosis, completed 3rd study`)
                                res.send()
                            })
                        } else {
                            sendMessage("Please indicate your symptom (1)Headache, (2)Dizziness, (3)Nausea, (4)Fatigue, (5)Sadness, (0)None", number, botNumber)
                            res.status(200)
                            res.setHeader('Content-Type', 'text/plain')
                            //res.write(`Number (${number}) was given a diagnosis`)
                            res.send()
                        }
                    })
                } else {
                    //first value is not in the string so they are responding to the first question
                    var acceptedValues = ['0', '1', '2', '3', '4', '5']

                    if (!acceptedValues.includes(text)) {
                        sendMessage("Please enter a number from 0 to 5", number, botNumber)
                        res.status(401)
                        res.setHeader('Content-Type', 'text/plain')
                        //res.write(`Number (${number}) responded with a value that is not acceptable`)
                        return res.send()
                    }

                    if (text == "0") {
                        increaseTimes(number, function(hitThree) {
                            if (hitThree == true) {
                                sendMessage("Thank you and see you soon", number, botNumber, function() {
                                    res.status(200)
                                    res.setHeader('Content-Type', 'text/plain')
                                    //res.write(`Number (${number}) was given a diagnosis, completed 3rd study`)
                                    res.send()
                                    return
                                })
                                return;
                            } else {
                                sendMessage("Thank you and we will check with you later", number, botNumber, function() {
                                    sendMessage("Please indicate your symptom (1)Headache, (2)Dizziness, (3)Nausea, (4)Fatigue, (5)Sadness, (0)None", number, botNumber, function() {
                                        res.status(200)
                                        res.setHeader('Content-Type', 'text/plain')
                                        //res.write(`Number (${number}) responded that they had no issues - next`)
                                        res.send()
                                    })
                                })
                            }
                        })
                    } else {
                        addFirstValue(number, text, function() {
                            console.log('Added first Item')
                        })

                        var firstValue = symptoms[text]

                        sendMessage(`On a scale from 0 (none) to 4 (severe), how would you rate your ${firstValue} in the last 24 hours?`, number, botNumber)

                        res.status(200)
                        res.setHeader('Content-Type', 'text/plain')
                        //res.write(`Number (${number}) to first question, second sent`)
                        res.send()
                    }
                }
            }
        });
    }
})

app.listen(PORT, () => {
    console.log(`Our app is running on port ${ PORT }`);
})
