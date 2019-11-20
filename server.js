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
        'number' : {S: number},
        'partOne': {S: 'true'},
        'count': {S: '0'},
        'valueCount': {S: '0'}
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

function increaseTimes(number, isZero, callback) {
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

            var countParams = {}

            if (count == 3) {
                return callback(true)
            }

            if (JSON.stringify(data).includes('values')) {
                value = data.Item['values']['S']
                valueCount = data.Item['valueCount']['S']

                if (!isZero) {
                    valueCount = Number(valueCount)
                    valueCount += 1
                }

                countParams = {
                    TableName: 'Messages',
                    Item: {
                      'number' : {S: number},
                      'count': {S: count.toString()},
                      'values': {S: value},
                      'partOne': {S: 'true'},
                      'valueCount': {S: valueCount.toString()}
                    }
                }
            } else {
                valueCount = data.Item['valueCount']['S']

                if (!isZero) {
                    valueCount = Number(valueCount)
                    valueCount += 1
                }

                countParams = {
                    TableName: 'Messages',
                    Item: {
                      'number' : {S: number},
                      'count': {S: count.toString()},
                      'partOne': {S: 'true'},
                      'valueCount': {S: valueCount.toString()}
                    }
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
            var value = data.Item['values']['S']
            var valueCount = data.Item['valueCount']['S']

            console.log('value: ' + value)

            var countParams = {
              TableName: 'Messages',
              Item: {
                'number' : {S: number},
                'count': {S: '1'},
                'values': {S: value},
                'partOne': {S: 'true'},
                'valueCount': {S: valueCount.toString()}
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

function addValue(number, value, callback) {
    var params = {
        TableName: 'Messages',
        Key: {
            'number': {S: number}
        }
    };

    ddb.getItem(params, function(err, data) {
        console.log(data)

        if (JSON.stringify(data).includes("values")) {
            var values = data.Item['values']['S']
            value = values.concat(',', value)
        }

        var currentCount = data.Item['count']['S'];
        var valueCount = data.Item['valueCount']['S']

        var addParams = {
            TableName: 'Messages',
            Item: {
                'number': {S: number},
                'values': {S: value},
                'partOne': {S: 'false'},
                'count': {S: currentCount},
                'valueCount': {S: valueCount.toString()}
            }
        };

        ddb.putItem(addParams, function(err, data) {
            if (err) {
                console.log("Error", err);
            } else {
                callback()
            }
        });
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

    var symptoms = ["Headache", "Dizziness", "Nausea", "Fatigue", "Sadness"]

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

                if (data.Item['partOne']['S'] == 'false') {
                    //the first item is in the string so they are responding to the second question
                    var acceptedValues = ['0', '1', '2', '3', '4']
                    var currentCount = data.Item['count']['S']

                    if (!acceptedValues.includes(text)) {
                        sendMessage("Please enter a number from 0 to 4", number, botNumber)
                        res.status(401)
                        res.setHeader('Content-Type', 'text/plain')
                        //res.write(`Number (${number}) responded with a value that is not acceptable`)
                        return res.send()
                    }

                    var values = data.Item['values']['S']
                    var valuesArray = values.split(',')
                    var valueCount = data.Item['valueCount']['S']
                    var currentValue = valuesArray[valueCount]


                    console.log("currentValue: " + currentValue)
                    console.log("values: " + valuesArray)

                    sendDiagnosis(text, number, botNumber, currentValue)

                    if (text == '0') {
                        increaseTimes(number, true, function(hitThree) {
                            if (hitThree == true) {
                                sendMessage("Thank you and see you soon", number, botNumber, function() {
                                    res.status(200)
                                    res.setHeader('Content-Type', 'text/plain')
                                    //res.write(`Number (${number}) was given a diagnosis, completed 3rd study`)
                                    res.send()
                                })
                            } else {
                                var messageString = "Please indicate your symptom "
                                var newValues = symptoms

                                valuesArray.forEach( function(value) {
                                    newValues.splice(newValues.indexOf(value), 1);
                                })
                                console.log(newValues)

                                for (var i = 0; i < newValues.length; i++) {
                                    messageString = messageString.concat(`(${i+1})${newValues[i]} `)
                                }

                                messageString = messageString.concat('(0)None')
                                console.log(messageString)

                                sendMessage(messageString, number, botNumber)
                                res.status(200)
                                res.setHeader('Content-Type', 'text/plain')
                                //res.write(`Number (${number}) was given a diagnosis`)
                                res.send()
                            }
                        })
                    } else {
                        increaseTimes(number, false, function(hitThree) {
                            if (hitThree == true) {
                                sendMessage("Thank you and see you soon", number, botNumber, function() {
                                    res.status(200)
                                    res.setHeader('Content-Type', 'text/plain')
                                    //res.write(`Number (${number}) was given a diagnosis, completed 3rd study`)
                                    res.send()
                                })
                            } else {
                                var messageString = "Please indicate your symptom "
                                var newValues = symptoms

                                valuesArray.forEach( function(value) {
                                    newValues.splice(newValues.indexOf(value), 1);
                                })
                                console.log(newValues)

                                for (var i = 0; i < newValues.length; i++) {
                                    messageString = messageString.concat(`(${i+1})${newValues[i]} `)
                                }

                                messageString = messageString.concat('(0)None')
                                console.log(messageString)

                                sendMessage(messageString, number, botNumber)
                                res.status(200)
                                res.setHeader('Content-Type', 'text/plain')
                                //res.write(`Number (${number}) was given a diagnosis`)
                                res.send()
                            }
                        })
                    }
                } else {
                    //first value is not in the string so they are responding to the first question
                    var newValues = symptoms

                    if (JSON.stringify(data).includes('values')) {
                        var values = data.Item['values']['S']
                        var valuesArray = values.split(',')
                        newValues = symptoms

                        valuesArray.forEach( function(value) {
                            newValues.splice(newValues.indexOf(value), 1);
                        })
                        console.log(newValues)
                    }

                    var acceptedValues = []

                    for (var i = 0; i <= newValues.length; i++) {
                        acceptedValues[i] = `${i}`
                    }

                    console.log(acceptedValues)

                    if (!acceptedValues.includes(text)) {
                        sendMessage(`Please enter a number from 0 to ${newValues.length}`, number, botNumber)
                        res.status(401)
                        res.setHeader('Content-Type', 'text/plain')
                        //res.write(`Number (${number}) responded with a value that is not acceptable`)
                        return res.send()
                    }

                    if (text == "0") {
                        increaseTimes(number, true, function(hitThree) {
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
                                var messageString = ""

                                if (JSON.stringify(data).includes("values")) {
                                    var values = data.Item['values']['S']
                                    var valuesArray = values.split(',')
                                    messageString = "Please indicate your symptom "
                                    var newValues = symptoms

                                    valuesArray.forEach( function(value) {
                                        newValues.splice(newValues.indexOf(value), 1);
                                    })
                                    console.log(newValues)

                                    for (var i = 0; i <= newValues.length; i++) {
                                        messageString = messageString.concat(`(${i+1})${newValues[i]} `)
                                    }

                                    messageString = messageString.concat('(0)None')
                                } else {
                                    messageString = "Please indicate your symptom (1)Headache, (2)Dizziness, (3)Nausea, (4)Fatigue, (5)Sadness, (0)None"
                                }

                                sendMessage("Thank you and we will check with you later", number, botNumber, function() {
                                    sendMessage(messageString, number, botNumber, function() {
                                        res.status(200)
                                        res.setHeader('Content-Type', 'text/plain')
                                        //res.write(`Number (${number}) responded that they had no issues - next`)
                                        res.send()
                                    })
                                })
                            }
                        })
                    } else {
                        var numText = Number(text)
                        var valueCount = data.Item['valueCount']['S']
                        valueCount = Number(valueCount)
                        var value = newValues[numText - 1]

                        addValue(number, value, function() {
                            console.log(`Added value`)
                        })

                        sendMessage(`On a scale from 0 (none) to 4 (severe), how would you rate your ${value} in the last 24 hours?`, number, botNumber)

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
