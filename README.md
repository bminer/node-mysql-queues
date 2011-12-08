# node-mysql-queues

Add your own node-mysql query queues to support transactions and multiple statements

For use with Node.JS and node-mysql: https://github.com/felixge/node-mysql

## Install

`npm install mysql-queues`

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
call. Thus, nested query queueing is supported in query callbacks, allowing
support for transactions and more.
See the source code for further documentation.

Note: Once `execute()` is called and all queries have completed, the Queue
will be empty again. You may continue to use `Queue.query` and `Queue.execute`
to queue and execute more queries. However, as noted below, you should
*never* reuse a Queue created by `client.startTransaction`

#### `Queue.commit()`

Available only if this Queue was created with `client.startTransaction`.
This queues 'COMMIT' and calls `execute()`
You should call either `commit()` or `rollback()` exactly once. Once you call
`commit()` on this Queue, you should discard it.

If you do not call `commit()` or `rollback()` and the Queue has completed
execution, `commit()` will be called automatically; however, one should
**NOT** rely on this behavior.

#### `Queue.rollback()`

Available only if this Queue was created with `client.startTransaction`.
This queues 'ROLLBACK' and calls `execute()`
You should call either `commit()` or `rollback()` exactly once. Once you call
`rollback()` on this Queue, you should discard it.
