xobj1 = {
		msg: "Message from frame 1 ",
		timeStamp: new Date().getTime(),
		changeTimeStamp: function() {
			this.timeStamp = new Date().getTime();
			xframe.updateXObj("xobj1", this);
			return this.timeStamp;
		},
		loadMsg: function(msg, onOk, onErr) {
			setTimeout(function(){if(onOk) onOk(msg + window.location.href);}, 3000);
		},
		click: function() {
			document.getElementById("myText").innerHTML = this.msg + this.timeStamp;
		},
		_xframe_wrapPolicy: {
			xInvoke:["changeTimeStamp"],
			extraInvoke:["click"],
			xInvokeCallback:["loadMsg"]
		}
	}