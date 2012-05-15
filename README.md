# node-mysql-queues

Add your own node-mysql query queues to support transactions and multiple statements.

For use with Node.js and node-mysql: https://github.com/felixge/node-mysql

## Background

node-mysql does not provide an API for MySQL transactions (yet).

There are a few problems with this:

- If you use the same database connection for 2 or more requests, then you can run
	into an issue where queries that should not intermix, end up intermixing.
	This can mess up MySQL transactions.
- There is no nice API to start, commit, or rollback transactions.

Fortunately, there are a few solutions:

- The easy solution: create a new connection to the database for each request, or
	to be extra safe, create a new connection for each transaction.  This is
	probably what PHP does.  Unfortunately, a new connection for each request
	can get expensive and slightly harm performance.
- The other solution: node-mysql-queues.  The idea behind node-mysql-queues is
	that we create separate query queues to ensure that queries in a particular
	queue do not overlap with queries in another queue; that is, they get executed
	in order, as expected. Plus, you have a nice, simple API for MySQL
	transactions. The disadvantage is that other requests with DB queries need
	to block while a transaction is executed, but I'm not sure about the effect
	on performance here.

All that being said, this project is still being actively maintained.  It has *NOT*
been tested with node-mysql 2.0, so if you upgrade to 2.0, please shoot me an email
with your comments.

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

//Or... as of version 0.3.0, you can do this...
var trans = client.startTransaction();
function error(err) {
	if(err && !trans.rolledback) {trans.rollback(); throw err;}
}
trans.query("DELETE...", [x], error);
for(var i = 0; i < n; i++)
	trans.query("INSERT...", [ y[i] ], error);
trans.commit(); //Implictly calls resume(), which calls execute()
/* In the case written above, COMMIT is placed at the end of the Queue, yet the
entire transaction can be rolled back if an error occurs. Nesting these queries
was not required. */

```
Even multiple Queues work! They get executed in the order that `execute()` is called.

## How it works

* If I'm a client.query() call or a Queue.execute() call...
	* If a Queue is currently executing
		* Place me on the main queue to be executed
	* Otherwise, Execute me now
		* Run all queries in the Queue in order
		* Wait for all query callbacks to complete. When they all complete, continue.
		* If the callback added more queries to this Queue, then jump to "Execute me now"
		* Otherwise
			* If this Queue is a transaction that has not been committed, then
			commit it now and issue a warning message.
			* Finally, Return control to the main queue by executing all queued queries

## API

### client.query(sql, [params, cb])

Use normally. Same as node-mysql, except that if a Queue is still pending
completion, this query may be queued for later execution.

### client.createQueue()

Creates a new query Queue.

### client.startTransaction()

Creates a new query Queue with "START TRANSACTION" as the first queued query.
The Queue object will also have `commit()` and `rollback()` methods.

### Queue.query(sql, [params, cb])

Same as node-mysql. This query will be queued for execution until `execute()`
is called on the `Queue`.

### Queue.execute()

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
Calling `execute()` on a paused Queue has no effect. (see `pause()` below)

Note: Once `execute()` is called and all queries have completed, the Queue
will be empty again, returning control to either: (a) another Queue that has been
queued for execution; or (b) the main node-mysql queue (a.k.a. queries executed
with `client.query`). Once a Queue is empty and has finished executing, you may
continue to use `Queue.query` and `Queue.execute` to queue and execute more
queries; however, as noted below, you should *never* reuse a Queue created by
`client.startTransaction`

### Queue.commit(cb)

Available only if this Queue was created with `client.startTransaction`.
Calls `cb(err, info)` when the COMMIT has completed.

As of version 0.3.0, the behavior of `commit()` is:

 * If the queue is empty when `commit()` is called, then 'COMMIT' will be
 queued to be excuted immediately. If this behavior is desired, and you
 are not sure if the queue will be empty, simply call `resume()`
 before calling `commit()`.
 * If the queue is not empty when `commit()` is called, then 'COMMIT' will
 be queued for execution when the queue is empty and all query callbacks
 have completed.

Calling `commit()` also implicitly calls `resume()` on the Queue.

You may only call `commit()` once. Once you call `commit()` on this Queue,
you should discard it. To avoid calling `commit()` twice, you can check
to see if it exists; once you call `commit()`, in most circumstances, the
function is deleted from the Queue object after it is called.

As of version 0.3.0, it is sometimes
possible to call `rollback()` even after `commit()` has been called.
If 'COMMIT' is queued for execution (i.e. if the queue is *not* empty when
`commit()` is called), then you may call `rollback()` on this Queue,
as long as `rollback()` occurs before the 'COMMIT' is executed (i.e. when the
Queue is empty and all query callbacks have completed).
You might use the functionality in a scenario where you only want your query
callbacks to call `rollback()` if an error occurred (i.e. a foreign key
constraint was violated). If no error occurs, you want to call `commit()`.
Rather than nesting all of these queries to determine whether or not to
call `commit()` or `rollback()`, you can simply queue up all of your queries,
call `commit()` to queue up a 'COMMIT', and call `rollback()` in your
query callbacks if an error occurs.

### Important Note!

If you do not call `commit()` or `rollback()` and the Queue has completed
execution, `commit()` will be called automatically to end the transaction;
however, one should **NOT** rely on this behavior. In fact, mysql-queues
will print nasty warning messages if you do not explicitly `commit()` or
`rollback()` a transaction.

### Queue.rollback()

Available only if this Queue was created with `client.startTransaction`.
This executes 'ROLLBACK' immediately, purges the remaining queries in the
queue, and immediately returns control to the main queue. Finally, the
callback `cb(err, info)` is called when the ROLLBACK has completed.

You may only call `rollback()` once. To avoid calling it twice, you can
check to see if it exists; once you call `rollback()`, the function is
deleted from the Queue object. Also, once you call `rollback()`, you cannot
call `commit()`.

Note: Before 0.2.3, `rollback()` would add the 'ROLLBACK' query to the Queue
and the Queue would continue executing. This was changed in 0.2.3 because it
is more natural for a ROLLBACK operation to abort the remaining Queue, since
it will be rolled back anyway. As mentioned above, this also allows you to
queue the COMMIT query at the bottom of the queue, and if an error occurs
before the COMMIT, you can safely `rollback()` the entire transaction.

### Queue.pause([maxWaitDuration])

Pauses the Queue, preventing it from returning control to the next Queue or
to the main node-mysql Queue. You can call `resume()` to resume the Queue,
or if the Queue is a transaction, `commit()` or `rollback()` will
automatically resume the Queue.

By default, the Queue will remain paused until you call `resume()` or end
the transaction; however, you may set an optional maximum wait duration,
which will prevent the Queue from pausing for too long.

*CAUTION:* A paused Queue will block all queries for this connection.
*Use with care.*

Pausing a Queue is useful to make additional asynchronous calls within a
query callback. An example of this is shown below.

### Queue.resume()

Resumes Queue execution. This function basically unpauses the Queue and
calls `execute()`.

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
example, you will get a warning message, your transaction will be committed
no matter what, and your program may throw an exception after the I/O
operation completes (because neither `commit()` nor `rollback()` can be
called more than once).

To be clear, the scope of this problem is *not* limited by asynchronous
file I/O operations; any asychronous call can cause this problem - even a
query to another database will cause this problem (i.e. if you execute a
series of MySQL queries and then update Redis, for example)

### Fortunately, there are a few solutions...

Possible solutions include: (in order of personal preference)

 * Performing your asynchronous operation BEFORE you execute any queued
 queries (i.e. we could have read "foobar.txt" first, then executed the query).
 I understand... most of the time, this is not possible.
 * Call `Queue.pause()` right before the asynchrous operation. This is the
 easy way out, but it comes at a small cost. If you pause a Queue, no query
 can be executed during the asynchronous operation. So, for scalability
 reasons, be sure that your asynchronous operation runs quickly (i.e. a Redis
 command or something). Don't do any video encoding on a 1 GB file.
 * Use synchronous I/O operations (i.e. readFileSync in this case). This
 is "just as bad" as calling `Queue.pause()` because the query execution is
 paused during the synchronous operation, which will take just as long.
 But, this works, too.

And finally, to be clear, you are allowed to do asynchronous calls within the
query callback of a transaction. You just need to `commit()` or `rollback()`
or `pause()` beforehand because the Queue will be empty by the time the
asynchronous operation completes.

## Questions / Comments / Bugs

Please feel free to contact me via GitHub, send pull requests, open issues, etc.

I am open to suggestions and criticisms.
