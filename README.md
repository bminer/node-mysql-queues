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

//Now you want a transaction?
var trans = client.startTransaction();
trans.query("INSERT...", [x, y, z], function(err, info) {
	if(err)
		trans.rollback();
	else
		trans.query("UPDATE...", [a, b, c, info.insertId], function(err) {
			if(err)
				trans.rollback();
			else
				trans.commit();
		});
});
trans.execute();
//No other queries will get executed until the transaction completes
client.query("SELECT ...") //This won't execute until the transaction is COMPLETELY done (including callbacks)
```

## API

#### `client.query(sql, [params, cb])`

Use normally. Same as node-mysql, except that if a Queue is still pending
completion, this query may be queued for later execution.

#### `client.createQueue()`

Creates a new query Queue.

#### `client.startTransaction()`

Creates a new query Queue with "START TRANSACTION" as the first queued query.
The Queue object will also have `commit()` and `rollback()` methods.

#### `Queue.query(sql, [params, cb])`

Same as node-mysql. This query will be queued for execution until `execute()`
is called on the `Queue`.

#### `Queue.execute()`

Executes all queries that were queued using `Queue.query`. Until all query
*callbacks* complete, it is guaranteed that all queries in this Queue
will be executed in order, with no other queries intermixed.  That is, during
execution of this query Queue, all queries executed using `client.query` will
be queued until this Queue is empty and all callbacks of this Queue have
finished executing. That means that a query added to a Queue can also queue
a query using `Queue.query`, and it will be executed before any `client.query`
call. Thus, nested query queueing is supported in query callbacks, allowing support
for transactions and more. See the source code for further documentation.

#### `Queue.commit()`

Available only if this Queue is a transaction. This queues 'COMMIT' and calls `execute()`
Once you call commit() on this Queue, you should discard it.

Note: if the Queue has already been released, this method throws an Exception.
A released Queue is one that has already been executed AND all callbacks have completed.
Normally, released Queues can be re-used, but transactions cannot be re-used.

In addition, release transaction Queues call commit() by default to end the transaction; however, this behavior SHOULD NOT be relied upon.

#### `Queue.rollback()`

Available only if this Queue is a transaction. This queues 'ROLLBACK' and calls `execute()`
Once you call rollback() on this Queue, you should discard it.

Note: if the Queue has already been released, this method throws an Exception.
