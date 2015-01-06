XFrameJS
========

####A Simple JavaScript Framework(one JS File) helping to invoke API and share properties of JS Object across iframes(support cross domains/origins) on HTML5 page.

xframe.js is just you want, a JavaScript AMD module. Use it in your html page.

test/frame1.html is a demo page, open it with browser, and click the button. You can find the code is really simple.

For example, If you want to invoke API of a JavaScript Object on the main page from a page inside iframe.
You should follow the steps:

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
// Register your JS Object to XFrame with a ID.
xframe.regXObj("myXObj", myXObj);
```
####3. On the page inside the iframe from which invoke the former 'myXObj', add:
```javascript
// Empty myXObj's shadow inside iframe page
// It defines function template like a interface in Java, and XFrameJS will implement it dynamically.
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

// Just require XObject with the same ID 'myXObj' provided on former page.
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
1. `You can invoke XObject provided inside iframe from the page outside iframe as well.`
2. `XFrame cann't return result, please use asyn callback.`
3. `The XObject's properties will be synchronized too(You should call xframe.updateXObj(myXObj) after property be set), so just set some properties to object as you like.`
4. `The XFrameJS implementation based on the HTML5 postMessage feature, please ensure your browser support it.`
5. `Be careful the security by your self. We just consider the pages outside and inside a iframe are trusted by each other. If not, you should custom your extension to make sure security.`

Good luck and enjoy!
