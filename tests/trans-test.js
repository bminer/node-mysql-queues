var queue = require('../index');

//Create a fake MySQL client
var db = {
	'query': function(sql, input, cb) {
		if(typeof input == "function")
		{
			cb = input;
			input = undefined;
		}
		console.log("Executing " + sql);
		//Simulate a database delay of 1 second
		setTimeout(function() {
			console.log("-------------" + sql + " CB");
			if(cb != null) cb();
		}, 1000);
	}
};

queue(db); //Enable queuing

//An example of what NOT to do
if(false)
{
	var trans = db.startTransaction();
	trans.query("INSERT", function() {
		//Emulate an async operation
		setTimeout(function() {
			//You can't use trans here!
			if(false)
				trans.commit();
			else
				trans.rollback();
		}, 1500);
	}).execute();
}

//Let's try this... using pause()
/*var trans = db.startTransaction();
db.query("START");
trans.query("INSERT", function() {
	//Emulate an async operation
	trans.pause();
	setTimeout(function() {
		try {
		//You can't use trans here!
		if(Math.random() > 0.5)
		{
			console.log("Commit");
			trans.commit(); //implicit resume
		}
		else
		{
			console.log("Rollback");
			trans.rollback();
		}
		} catch(e) {console.log(e)}
	}, 2000);
}).execute();
db.query("FINALLY");*/

var trans2 = db.startTransaction();
function error() {
	if(!trans2.rolledback)
	{
		console.log("Print once");
		trans2.rollback();
	}
}
trans2.query("1", error);
trans2.query("2", error);
trans2.commit();
