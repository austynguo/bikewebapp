var express = require('express')
  , cluster = require('cluster')
  , numCpus = require('os').cpus().length
  , bodyParser = require('body-parser')
  , fs = require('fs')
  , hbs = require('hbs')
  , http = require('http')
  , mongoose = require('mongoose')
  , morgan = require('morgan')
  , compress = require('compression')
  , logger = require('logfmt')
  , routes = require('./routes')
  , reports = require('./routes/reports')
  , locations = require('./routes/locations')
  , fauxAuth = require('./middleware/staging-auth')
  , concurrency = process.env.WEB_CONCURRENCY || 1
  ;

// Log process environment to console
console.log("process.env: "+process.env);
console.dir(process.env);

var app = express()
  // Get environment variables
  // NODE_ENV is set to 'development' by default if not specified
  // On heroku this is set to production
  , env = app.get('env')
  , config = require('./config/config')[env]
  , dbCnx = process.env.MONGODB_URI || config.db
  , db = mongoose.connect(dbCnx)
  , port = process.env.PORT || config.port || 3000
  ;

console.log("env: "+env);

// memjs reads appropriate env variables by default.
// zero configuration necessary
app.set('view engine','ejs');
app.engine('html', hbs.__express);
app.use(compress());
app.use(express.static('public'));

app.set('port', port)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));


// setting environment? -> what is morgan?
switch (app.get('env')) {
    case 'development':
        app.use(morgan('dev'));
        break;

    case 'staging':
        app.use(fauxAuth);
        break;

    default:
        app.use(morgan('combined'));
        break;
}

app.use(require('./routes/index.js'));
app.get('/reports/count.json', reports.count);
app.get('/reports/:id.json', reports.show);
app.get('/reports.json', reports.index);
app.post('/reports.json', reports.create);
app.get('/locations.json', locations.index);
app.get('/locations/count.json', locations.count);
app.use(require('./routes/wards.js'));


// Detects clusters, forks cluster for each CPU core
if (cluster.isMaster) {
  for (var i = 0; i < concurrency; i++) {
    cluster.fork();
    console.log("Fork #"+i);
  }

  cluster.on('exit', function(worker, code, signal) {
    logger.log({worker: worker.process.pid, msg: 'died', code: code, signal: signal});
  });

} else {
  console.log("Create server");
  http.createServer(app).listen(port, function() {
    logger.log({status: 'info', msg: 'server listening', port: port});
  });
}
