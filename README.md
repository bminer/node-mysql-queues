# node-mysql-queues

Add your own node-mysql query queues to support transactions and multiple statements

For use with Node.JS and node-mysql: https://github.com/felixge/node-mysql

## Usage

```javascript
var mysql = require('mysql');
var client = mysql.createClient({
	user: 'root',
	password: 'root'
});
//Enable mysql-queues
var queues = require('mysql-queues');
queues(client);
//Start running queries as normal...
client.query(...);

//Now you want a separate queue?
var q = client.createQueue();
q.query(...); 
q.query(...);
q.execute();

client.query(...); //Will not execute until all queued queries completed.
```
