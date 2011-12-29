# node-mysql-queues

Add your own node-mysql query queues to support transactions and multiple statements.

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
const DEBUG = true;
queues(client, DEBUG);
//Start running queries as normal...
client.query(...);

//Now you want a separate queue?
var q = client.createQueue();
q.query(...); 
q.query(...);
q.execute();

client.query(...); //Will not execute until all queued queries (and their callbacks) completed.

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

//Or... as of version 0.2.3, you can do this...
var trans = client.startTransaction();
function error(err) {
	if(err) {trans.rollback(); throw err;}
}
trans.query("DELETE...", [x], error);
for(var i = 0; i < n; i++)
	trans.query("INSERT...", [ y[i] ], error);
trans.commit();
/* In the case written above, COMMIT is placed at the end of the Queue, yet the
entire transaction can be rolled back if an error occurs. Nesting these queries
was not required. */

//Even multiple Queues work! They get executed in the order that `execute()` is called.
## API

#### client.query(sql, [params, cb])

Use normally. Same as node-mysql, except that if a Queue is still pending
completion, this query may be queued for later execution.

#### client.createQueue()

Creates a new query Queue.

#### client.startTransaction()

Creates a new query Queue with "START TRANSACTION" as the first queued query.
The Queue object will also have `commit()` and `rollback()` methods.

#### Queue.query(sql, [params, cb])

Same as node-mysql. This query will be queued for execution until `execute()`
is called on the `Queue`.

#### Queue.execute()

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

Calling `execute()` on an already executing Queue has no effect.

Note: Once `execute()` is called and all queries have completed, the Queue
will be empty again, returning control to either: (a) another Queue that has been
queued for execution; or (b) the main MySQL queue (a.k.a. queries executed
with `client.query`). Once a Queue is empty and has finished executing, you may
continue to use `Queue.query` and `Queue.execute` to queue and execute more
queries; however, as noted below, you should *never* reuse a Queue created by
`client.startTransaction`

#### Queue.commit()

Available only if this Queue was created with `client.startTransaction`.
This queues 'COMMIT' and calls `execute()`.
You should call either `commit()` or `rollback()` exactly once. Once you call
`commit()` on this Queue, you should discard it.

As of version 0.2.3, it is now possible to call `rollback()` even after
`commit()` has been called. In a typical scenario, you want your query
callbacks to call `rollback()` if an error occurred (i.e. a foreign key
constraint was violated). If no error occurs, you want to call `commit()`.
There are some situations when you execute multiple queries "at the same time"
and you want to commit all of them if and only if they succeed. This allows
you to avoid nesting these queries, queue them up, queue up COMMIT, and
execute `rollback()` only if an error occurs.

If you do not call `commit()` or `rollback()` and the Queue has completed
execution, `commit()` will be called automatically; however, one should
**NOT** rely on this behavior. In fact, mysql-queues will print nasty
warning messages if you do not explicitly `commit()` or `rollback()` a
transaction.

#### Queue.rollback()

Available only if this Queue was created with `client.startTransaction`.
This executes 'ROLLBACK' immediately and purges the remaining queries in the
queue. You should call either `commit()` or `rollback()` exactly once. Once
you call `rollback()` on this Queue, you should discard it.

Note: Before 0.2.3, `rollback()` would add the 'ROLLBACK' query to the Queue
and the Queue would continue executing. This was changed in 0.2.3 because it
is more natural for a ROLLBACK operation to abort the remaining Queue, since
it will be rolled back anyway. As mentioned above, this also allows you to
queue the COMMIT query at the bottom of the queue, and if an error occurs
before the COMMIT, you can safely `rollback()` the entire transaction.

### require('mysql-queues')(client, debug)

Attaches mysql-queues to the mysql client. When `debug` mode is enabled,
debugging messages are printed to standard error when certain exceptions occur.
When you queue a query, the call stack becomes somewhat useless, and it can
become difficult to determine which query is causing a problem. The debug
feature allows you to more easily determine which query that caused a problem.

## Don't do this...

```javascript
//You may be tempted to do this...
var fs = require('fs');
var trans = db.startTransaction();
trans.query("INSERT ...", [...], function(err, info) {
	fs.readFile("foobar.txt", function(err, data) {
		//By now, it's too late to use `trans`
		if(data == "something")
			trans.commit();
		else
			trans.rollback();
	});
	//The query callback is now done!! This is your last chance
	//to call `commit` or `rollback`
}).execute();
```

In the case above, an asynchronous call was placed in the query callback.
This won't work as expected. The query callback completes and automatically
executes `commit()` before the asychronous filesystem call completes. In this
example, you will get a warning message, but that's it! The problem will run
normally otherwise, but the expected behavior will not produced.

To be clear, this problem is limited by aynchronous file I/O operations; even
a query to another database will cause this problem (i.e. if you execute a
series of MySQL queries and then update Redis, for example)

Possible workarounds include:
 - Using synchronous I/O operations (i.e. readFileSync in this case)
 - Performing your asynchronous operation BEFORE you execute any queued
 queries.

Limitations:
 - As far as I know, you can't use mysql-queues to run a MySQL query, run a
 Redis command, and then `commit()` if and only if neither return an error.
 I may add a `pause()` method, which will pause a Queue and all queries until
 `resume()` is called. This would allow you to `pause()` right before the
 Redis command and `resume()` when the Redis command is completed.
