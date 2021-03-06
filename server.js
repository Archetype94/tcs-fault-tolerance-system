console.log('Initializing...')

const mongoClient = require('mongodb').MongoClient
var db
tryFunction(() => {
  mongoClient.connect('mongodb://localhost/',
    (error, client) => {
      if (error)
        console.error(error)
      else {
        db = client.db('tcs-fault-tolerance-system')
        db.createCollection('forms')
        db.command({
          collMod: 'forms',
          validator: {
            $jsonSchema: {
              required: ['name']
            }
          }
        })
        db.createCollection('files')
        db.command({
          collMod: 'files',
          validator: {
            $jsonSchema: {
              required: ['formId', 'path']
            }
          }
        })
      }
    })
})

const
  fs = require('fs'),
  path = require('path'),

  express = require('express'),
  server = express(),

  multer = require('multer'),
  uploadDir = './uploads',
  fileUpload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (request, file, f) => {
        f(null, request.params.submissionId + file.originalname);
      }
    }),
    limits: {
      fileSize: 4000000
    },
    fileFilter: (req, file, callback) => {
      const
        allowedFileTypes = /doc|docx|pdf|jpeg|jpg|png/,
        extension = allowedFileTypes.test(path.extname(file.originalname).toLowerCase()),
        mimeType = allowedFileTypes.test(file.mimetype)

      if (extension && mimeType) {
        return callback(null, true)
      } else {
        callback('Invalid file type')
      }
    }
  }).single('file')

server.use('/', express.static(__dirname))
server.use(express.json())

server.get('/', function(req, res) {
  res.render('index')
})
server.get('/*', function(req, res) {
  res.sendFile(__dirname)
})

server.post('/submit', function(request, response) {
  console.log('Submit request received', request.body)

  tryUpdate(response, () => {
    db.collection('forms').insertOne(request.body,
      (error, result) => {
        if (error) {
          badRequest(response, 'Submission invalid', error)
        } else {
          console.log('Database updated successfully', result.insertedId)
          response.status(200).send(result.insertedId)
        }
      })
  })
})
server.post('/upload/:submissionId', function(request, response) {
  console.log('Upload request received', request.params.submissionId)

  tryUpdate(response, () => {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }

    fileUpload(request, response, (error) => {
      if (error) {
        badRequest(response, 'Upload error', error)
      } else {
        if (request.file == undefined) {
          badRequest(response, 'Upload invalid', 'File does not exist')
        } else {
          db.collection('files').insertOne({
            formId: request.params.submissionId,
            path: "uploads/" + request.file.filename
          }, (error, result) => {
            if (error) {
              badRequest(response, 'File invalid', error)
            } else {
              console.log('File uploaded successfully', result.insertedId)
              response.status(200).send()
            }
          })
        }
      }
    })
  })
})

server.listen(8081, function() {
  console.log('Server has successfully started')
})

function badRequest(response, message, error) {
  console.error(message + ':', error)
  response.status(400).send(message)
}

function tryFunction(f) {
  try {
    return f();
  } catch (error) {
    console.error(error)
  }
}

function tryUpdate(response, f) {
  try {
    return f();
  } catch (error) {
    console.error(error)
    response.status(500).send('Internal Server Error')
  }
}