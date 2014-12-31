XFrameJS
========

####A Simple JavaScript Framework(one JS File) helping to invoke API of JavaScript Object Between iframes(even cross domains) on HTML5 page.

xframe.js is just you want, a JavaScript AMD module. Use it in your html page.

test/frame1.html is a demo page, open it with browser, and click the button. You can find the code is really simple.

####1. Refer xframe.js on the html5 pages outside and inside the iframe.
```javascript
<script src="xframe.js"></script>
```
####2. On the page provide a JS Object to be invoked, add:
```javascript
// For example: a js obj with 2 classical function, the second with callbacks.
var myXObj = {
	sayHello: function(name) {
		console.log("Hello " + name);
	},
	funcWithCallback: function(params, onOk, onErr) {
		if(typeof onOk == "function")onOk();
	}
}
xframe.regXObj("myXObj", myXObj);
```
####3. On the page invoke the former 'myXObj', add:
```javascript
// Empty 'myXObj' shadow define function template like a interface in Java.
var myXObj = {
	sayHello: function() {},
	funcWithCallback: function() {},
	// And config invoke policy with function name.
	_xframe_wrapPolicy: {
		// invoke once on provider page.
		xInvoke:[],
		// invoke twice on both provider or consumer page(if the function on consumer is empty like here, do nothing).
		extraInvoke:["sayHello"],
		// Like xInovke policy, but try to search onOk and onErr callback functions to return the result.
		xInvokeCallback:["funcWithCallback"]
	}
}

// Just require 'myXObj' provided on former page.
xframe.require(["myXObj"], function(myXObj) {
	// Register XObj shadow specifing the invoke policies in function templates.
	xframe.regXObjShadow("myXObj", myXObj/*, function(shadow){}*/);
	myXObj.sayHello("Leo Chang");
	myXObj.funcWithCallback(null, 
		function(){
			// callback ok...
		}, function(){
			// some error maybe.
		}
	);
});
```

####Note:
1. `XFrame cann't return result, just use asyn callback.`
2. `The XObject's properties will be synchronized too(You should call xframe.updateXObj(myXObj) after property be set), so just set some properties to object as you like.`
