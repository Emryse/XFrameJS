/*
 * A helper javascript tool for sharing object(XObject) across iframes 
 * and its parent frame even they are in different domains.
 * Call getXObj(), regXObj(), regXObjShadow(), updateXObj() functions.
 */
(function(root) {
	if(typeof window.xframe == "undefined")
	{
		window.xframe = {
			_xObjs: {},
			_id: "xframe" + new Date().getTime() + "_" + Math.round(Math.random() * 10000), // Create a unique id for this Xframe instance.
			init: function(xObjs, xObjShadows) {
				if(!!this.__inited)
					return this;
				this.__inited = true;
				
				var self = this;
				var handleMessage = function(e) {
					var PREFIX = "xframeMsg:";
					var msg = e.data;
	
					if(msg && msg.indexOf(PREFIX) == 0)
					{
						var script = msg.substring(PREFIX.length);
						// Record the current message context.
						self._invokeCtx = {origMsg:e, srcWin: e.source, msg: e.data};
						try{
							eval(script);
						}catch(e){
							console.error(e);
						}
						self.invokeCtx = null;
					}
				};
		
				var notifyLoadedEvent = function() {
					// Emit this xframe loaded event.
					var loadEvent = {
						type: "xframe_loaded",
						xframeId: self._id,
						location: window.location.href
					};
					self._wrapXFrameAPI(null, "xframe", "_emitXFrameEvent")(loadEvent);
					
					// Register init xObjs.
					if(typeof xObjs == "object")
					{
						for(var key in xObjs)
							self.regXObj(key, xObjs[key]);
					}
					// Register init xObjShadows.
					if(typeof xObjShadows == "object")
					{
						for(var key in xObjShadows)
							self.regXObjShadow(key, xObjShadows[key]);
					}
				};
				
				// Add a event listener to record xframe load and xobj reg event for require function.
				this.onXframeEvent(function(evt) {
					if(evt.type == "xframe_loaded")
					{
						if(!self.__xframeLoadedEvts)
							self.__xframeLoadedEvts = [];
						self.__xframeLoadedEvts.push(evt);
						
						if(self.__selfXobjRegEvets) {
							// Post buffered xobj register events to loaded frame.
							var i;
							for(i=0;i<self.__selfXobjRegEvets.length;i++)
							{
								var xObjRegEvt = self.__selfXobjRegEvets[i];
								self._wrapXFrameAPI(self._invokeCtx.srcWin, "xframe", "_emitXFrameEvent")(xObjRegEvt);
							}
						}
					}
					
					if(evt.type == "xobj_registered")
					{
						if(!self.__xobjRegEvts)
							self.__xobjRegEvts = [];
						self.__xobjRegEvts.push(evt);
	
						// If a XObj shadow registered from other frame, do XObj synchronize 
						// if local XObj available even it's a shadow itself.
						if(self._id != evt.xframeId && evt.isShadow)
						{
							var localXObj = self.getXObj(evt.name);
							if(localXObj)
								self._syncChangedXObj(evt.name, localXObj);
						}
	
						// Check if some require entry satisfied.
						self._requireCheck();
					}
				});
				
				this._connect("message", handleMessage);
				this._connect("load", notifyLoadedEvent);
				return this;
			},
			getXObj: function(xObjName) {
				return this._xObjs[xObjName];
			},
			regXObj: function(name, obj, isXObjShadow) {
				if(typeof this._xObjs[name] == "object")
					console.warn("Override XObject \"" + name + "\".");
				
				this._xObjs[name] = obj;
				// Decorate XObj, proxy its some method and append new xframe's properties.
				this._decorateXObj(name, obj, isXObjShadow);
				
				// Emit a XObj reg event to other frames.
				var xObjRegEvt = {
						type: "xobj_registered",
						xframeId: this._id,
						name: name,
						//xObj: xObj,
						isShadow: !!isXObjShadow
					};
				
				// Buffer the obj reg evets of this xframe, and post them to other frame when their load event.
				if(!this.__selfXobjRegEvets)
					this.__selfXobjRegEvets = [];
				this.__selfXobjRegEvets.push(xObjRegEvt);
				
				// Check any require entries satisfied and remove them.
				this._requireCheck();
				
				this._wrapXFrameAPI(null, "xframe", "_emitXFrameEvent")(xObjRegEvt);
			},
			regXObjShadow: function(name, xObjShadow, onSyncOk) {
				onSyncOk = this._safeCallback(onSyncOk);
				// If this XObj has be registered with this name, return it;
				var existedXObj = this._xObjs[name];
				if(typeof existedXObj == "object") {
					console.warn("Override XObject[name:" + name + ", isShadow:" + !existedXObj._xframe_isXObj + "]");
					if(typeof onSyncOk == "function")
					{
						if(existedXObj._xframe_isXObj)
							onSyncOk(existedXObj);
						else {
							var findFomerRegistry = false;
							if(this.__selfXObjShadowSyncCallbanks)
							{
								// Merge this onSync to former registry's callback function.
								for(var i=0;i<this.__selfXObjShadowSyncCallbanks.length;i++)
								{
									var tmp = this.__selfXObjShadowSyncCallbanks[i];
									if(tmp.name == name)
									{
										tmp.callback = (function(callback1, callback2) {
											return function() {
												if(callback1) callback1(existedXObj);
												if(callback2) callback2(existedXObj);
											};
										})(tmp.callback, onSyncOk);
										findFomerRegistry = true;
										break;
									}
								}
								// If is shadow find, but not find any registered, consider its shadow has been 
								// callbacked and cleared, invoke current callback directly.
								if(!findFomerRegistry)
									onSyncOk(existedXObj);
							}
						}
					}
					return existedXObj;
				}
				
				// Buffer the callback function wait for synchronization of the XObj.
				if(typeof onSyncOk == "function")
				{
					if(!this.__selfXObjShadowSyncCallbanks)
						this.__selfXObjShadowSyncCallbanks = [];
					this.__selfXObjShadowSyncCallbanks.push({name: name, callback:onSyncOk});
				}
				this.regXObj(name, xObjShadow, true);
			},
			require: function(xObjNames, callback) {
				if(typeof callback != "function") return;
				
				// Wrap callback function to catch its all error to avoid affend to framework code.
				callback = this._safeCallback(callback);
				
				// Check events buffer from this xframe or others has registered the required XObjs.
				// If true, callback and return directly.
				if(!this._requireCheck(xObjNames, callback))
				{
					if(!this.__requireRegistry)
						this.__requireRegistry = [];
					this.__requireRegistry.push({xObjNames:xObjNames, callback: callback});
				}
			},
			_safeCallback: function(callback) {
				// Wrap the callback function to catch its all error.
				if(typeof callback != "function")
					return callback;
				return function() {
					try {
						callback.apply(this, arguments);
					} catch(e) {
						console.error("Callback Error: " + e);
					};
				};
			},
			_requireCheck: function(xObjNames, callback) {
	
				// Check history xObj Register events.
				var checkXObjRegEvents = function(events) {
					if(!events)
						return 0;
					
					var satisfied = [];
					var j;
					for(j=0;j<xObjNames.length;j++)
					{
						var i;
						for(i=0;i<events.length;i++)
						{
							if(xObjNames[j] == events[i].name)
							{
								satisfied.push(j);
								break;
							}
						}
					}
					
					var n;
					for(n=0;n<satisfied.length;n++) {
						//var tmp = xObjNames[satisfied[n]];
						xObjNames.splice(satisfied[n] - n, 1);
						//satisfied[n] = tmp;
					}
					
					return satisfied.length;
				};
		
				// If xObjNames given, not check all registered require entries.
				if(xObjNames)
				{
					// Clone a copy of xObjNames, because we need to remove element and don't want to affect original one.
					var originalXObjNames = xObjNames;
					xObjNames = xObjNames.concat();
					if(checkXObjRegEvents(this.__selfXobjRegEvets) + checkXObjRegEvents(this.__xobjRegEvts) == originalXObjNames.length)
					{
						callback();
						return true;
					}
					return false;
				} 
				
				var satisfied = [];
				// Check if some require entry satisfied.
				if(this.__requireRegistry)
				{
					var unsatisfied = [];
					var p;
					for(p=0;p<this.__requireRegistry.length;p++)
					{
						var requireData = this.__requireRegistry[p];
						xObjNames = requireData.xObjNames;
						// Clone a copy of xObjNames
						var originalXObjNames = xObjNames;
						xObjNames = xObjNames.concat();
						callback = requireData.callback;
							
						if(checkXObjRegEvents(this.__selfXobjRegEvets) + checkXObjRegEvents(this.__xobjRegEvts) == originalXObjNames.length)
						{	
							satisfied.push(requireData);
						} else
							unsatisfied.push(requireData);
					}
					
					// Reset the __requireRegistry to the left unsatisfied registry.
					if(unsatisfied.length != this.__requireRegistry.length)
						this.__requireRegistry = unsatisfied;
					for(var l=0;l<satisfied.length;l++)
						satisfied[l].callback();
				}
				
				// Return satisfied require entries.
				return satisfied;
			},
			onXframeEvent: function(callback) {
				if(typeof callback != "function")
					return;
				if(!this._eventListeners)
					this._eventListeners = [];
				this._eventListeners.push(callback);
			},
			updateXObj: function(name, newObj) {
				// Update
				var dispatchPath = typeof newObj == "object" ? newObj._xframe_disPath : undefined;
				// Check the dispatch path to avoid circle dispatch.
				if(!!dispatchPath && dispatchPath.indexOf(this._id) > -1)
					return;
				
				var redispatchXObj = newObj;
				var oldXObj = this._xObjs[name];
				
				if(typeof oldXObj == "object")
				{
					if(typeof newObj != "object")
						redispatchXObj = oldXObj;
					else {
						if( oldXObj !== newObj)
						{
							if(oldXObj._xframe_isXObj)
							{
								// If the update not dispatched from other frames.
								if(typeof newObj._xframe_disPath == "undefined")
								{
									newObj._xframe_id = oldXObj._xframe_id;
									newObj._xframe_isXObj = oldXObj._xframe_isXObj;
									this._xObjs[name] = newObj;
								} else 
									this._mixin(oldXObj, newObj);
							} else {
								this._mixin(oldXObj, newObj);
								
								// Check if some callback waits for this synchronized XObj.
								if(this.__selfXObjShadowSyncCallbanks)
								{
									var i;
									for(i = 0; i < this.__selfXObjShadowSyncCallbanks.length; i++)
									{
										var syncCallback = this.__selfXObjShadowSyncCallbanks[i];
										if(syncCallback.name == name) {
											this.__selfXObjShadowSyncCallbanks.splice(i,1);
											syncCallback.callback(oldXObj);
											break;
										}
									}
								}
								
							}
						}
					}
				} 
		
				if(typeof redispatchXObj == "object")
					this._syncChangedXObj(name, redispatchXObj);
			},
			_syncChangedXObj: function(xObjName, changedXObj)
			{
				// Append this xframe's id in the dispatch path.
				if(!changedXObj._xframe_disPath)
					changedXObj._xframe_disPath = [];
				changedXObj._xframe_disPath.push(this._id);
		
				// Dispatch changed XObj to assoc frames, ie. parent frame or sub iframes.
				this._wrapXFrameAPI(null, "xframe", "updateXObj")(xObjName, changedXObj);
	
				// Clear dispatch path.
				changedXObj._xframe_disPath = undefined;
			},
			_getAssocFrames: function(xObj) {
				var frames = [];
				// FIXME: Here we make parent and children iframe as assoc frame to post message.
				// We can do a buffer when other frame notice to optimize performace. However there isn't a mechanism to make 
				// sure the required frame load before these XObj can be synchronized and used.
	
				// Regard the parent as first assoc frame.
				if(!!window.parent && window.parent != window)
					frames.push(window.parent);
				// And all children iframes of current window.
				var iframes = document.getElementsByTagName("iframe");
				var i;
				for(i=0; i<iframes.length; i++)
					frames.push(iframes[i].contentWindow);
				
				return frames;
			},
			_findInvokeObj: function(objId) {
				var xObj = (objId == "xframe" ? xframe : this._xObjs[objId]);
				if(typeof xObj != "object")
				{
					// if objId is like obj1.obj2, split and find sub object.
					var objIdSegs = objId.split(/[\['"\]\.]+/);
					if(objIdSegs.length > 1)
					{
						var i;
						for(i=0;i<objIdSegs.length;i++)
						{
							var seg = objIdSegs[i];
							if(seg.length > 0)
							{
								if(i==0)
									xObj = this._xObjs[seg];
								else
									xObj = xObj[seg];
								
								if(!xObj || typeof xObj != "object")
								{
									xObj = undefined;
									break;
								}
							}
						}
					}
				}
				return xObj;
			},
			_proxyInvoke: function(invokeData) {
				var self = this;
				var objId = invokeData.objId;
				var funcName = invokeData.funcName;
				var args = invokeData.args;
				// JSON.stringify may stringify args of the invokeData as string, 
				// not a array in some case. Do a eval to json obj here if so.
				// So dose to invokePath.
				if(typeof args == "string")
					args= eval("(" + args + ")");
				var invokePath = invokeData.invokePath;
				if(typeof invokePath == "string")
					invokePath= eval("(" + invokePath + ")");
				//var sourceFrameId = invokeData.frameId;
		
				// If this invoke triggered from this xframe, skip invoke to avoid circle-invoke.
				if(invokePath.indexOf(this._id) > -1)
				{
					return;
				}
				
				// If we find this invoke be dispatch from this xframe, skip invoke to avoid circle invoke.
				var xObj = this._findInvokeObj(objId);
				// If found onOK, onErr callback functions, here need to wrap them with postMessage.
				if(typeof xObj == "object") {
					var func = xObj[funcName];
					if(func._xframe_isWrapper)
						func.curInvokePath = invokePath;
					
					// Wrap callback function args if a arg start with "_xframe_callback".
					// Skip invoke to xframe._invokeCallback method.
					if(!(objId == "xframe" && funcName == "_invokeCallback"))
					{
						var i;
						for(i=0;i<args.length;i++)
						{
							if(typeof args[i] == "string" && args[i].indexOf("_xframe_callback") == 0)
							{
								var callbackId = args[i];
								args[i] = function(callbackId) {
									return function(){
										var callbackArgs = [];
										for(var key in arguments)
											callbackArgs.push(arguments[key]);
										// FIXME：Wrap a callback invoke to the source window of this postMessage invoke.
										//var srcWin = (typeof self._invokeCtx == "object" ? self._invokeCtx.srcWin:null);
										self._wrapXFrameAPI(null, "xframe", "_invokeCallback")(callbackId, callbackArgs);
									};
								}(callbackId);
							}
						}
					}
	
					var result = xObj[funcName].apply(xObj, args);
					func.curInvokePath = undefined;
				}
				// Else if not found xObj, ignore it.
			},
			_invokeCallback: function(callbackId, args) {
				if(typeof this.__callbacks == "object")
				{
					var callbackFunc = this.__callbacks[callbackId];
					if(typeof callbackFunc == "function")
					{
						delete this.__callbacks[callbackId];
						callbackFunc.apply(this, args);
						return;
					}
				}
				
				// If not found callback func, do nothing.
				//console.error("Callback not found:" + callbackId);
			},
			_wrapXFrameAPI: function(frame, xObjName, func, policy)
			{
				var self = this;
				
				if(!policy) policy = "xInvoke"; //extraInvoke, xInvokeCallback
				
				var funcWarpper = function() {
					var funcName = String(func);
					funcName = funcName.replace(/^function(\s|\n)+(.+)\((.|\n)+$/,'$2');
					// Convert arguments from object to array.
					var args = [];
					for(var key in arguments)
						args.push(arguments[key]);
					
					try {
						var invokePath = funcWarpper.curInvokePath;
						if(!invokePath) invokePath = [];
						// Append this xframe's id to the invoke path.
						invokePath.push(self._id);
						
						var invokeData = {
							objId: xObjName,
							funcName: funcName,
							args: args,
							frameId: self._id,
							invokePath: invokePath
						};
						
						//If callback invoke, wrap and register callback functions.
						if("xInvokeCallback" == policy)
						{
							if(!self.__callbacks) self.__callbacks = {};
							// Find all function arguments and register the callback id with the function.
							var i;
							for(i=0;i<args.length;i++)
							{
								if(typeof args[i] == "function")
								{
									// Use random int to name the callback id to avoid repetition.
									var callbackId = "_xframe_callback_" + new Date().getTime() + "_" + Math.round(Math.random() * 10000);
									var callbackFunc = args[i];
									self.__callbacks[callbackId] = callbackFunc;
									// Replace this arg with callback id.
									args[i] = callbackId;
								}
							}
						}
		
						//if("xInvoke" == policy || "extraInvoke" == policy || "xInvokeCallback" == policy)
						{
							// Our message prefix with "xframeMsg:" to make them different from others if any.
							var msg = "xframeMsg:xframe._proxyInvoke("+ JSON.stringify(invokeData) +");";
							if(frame)
								frame.postMessage(msg,'*');
							else {
								// If not given frame to send the invoke message, send to all assoc frame.
								var frames = self._getAssocFrames();
								var i;
								for(i=0;i<frames.length;i++)
								{
									var assocFrame = frames[i];
									assocFrame.postMessage(msg,'*');
								}
							}
						}
						
						// Do extra local invoke by apply the original function before wrap.
						if("extraInvoke" == policy)
						{
							var xObj = self._findInvokeObj(xObjName);
							if(typeof xObj == "object") {
								// Result local invoke result.
								return xObj[funcName].originalFunc.apply(xObj, args);
							} else
								console.error("LocalInvoke not found object: " + objId);
						}
					} catch(e) {
						console.error("XObj function wrapper invoke error:\n" + xObjName + "." + funcName + "(" + JSON.stringify(args)+ ")\n" + e);
					}
				};
				
				// Add a wrapper mark.
				funcWarpper._xframe_isWrapper = true;
				
				return funcWarpper;
			},
			_emitXFrameEvent: function(evt) {
				if(this._eventListeners)
				{
					var i;
					for(i=0;i<this._eventListeners.length;i++)
						this._eventListeners[i](evt);
				}
			},
			_decorateXObj: function(xObjName, xObj, isXObjShadow) {
				// If xObj null or undefined, return directly.
				if(!xObj) return;
				
				var self = this;
				// Add a stamp to xObj.
				xObj._xframe_id = this._id;
				xObj._xframe_isXObj = !isXObjShadow;
				
				/*
				var emptyPolicy = {
						extraInvoke:[],
						xInvoke:[],
						xInvokeCallback:[]
					}
				*/
				
				var getFuncWrapPolicy = function(obj, funcName)
				{
					var funcWrapPolicy = obj._xframe_wrapPolicy;
					if(funcWrapPolicy)
					{
						if(funcWrapPolicy.extraInvoke && funcWrapPolicy.extraInvoke.indexOf(funcName)>-1) 
							return "extraInvoke";
						if(funcWrapPolicy.xInvoke && funcWrapPolicy.xInvoke.indexOf(funcName)>-1) 
							return "xInvoke";
						if(funcWrapPolicy.xInvokeCallback && funcWrapPolicy.xInvokeCallback.indexOf(funcName)>-1)
							return "xInvokeCallback";
					}
				};
		
				var wrapObjFuncs = function(name, obj)
				{
					for(var key in obj)
					{
						var value = obj[key];
						// If XObj Shadow, wrap the method with postMessage.
						if(typeof value == "function" && isXObjShadow)
						{
							var policy = getFuncWrapPolicy(obj, key);
							if("xInvoke" == policy || "extraInvoke" == policy || "xInvokeCallback" == policy)
							{
								var funcWrapper = self._wrapXFrameAPI(null, name, key, policy);
								// Record the original function as a attribute of the wrapper.
								funcWrapper.originalFunc = value;
								obj[key] = funcWrapper;
							} 
							// else
							// If not policy for this function.
						}
						
						// If value is a "object" and not array or null.
						if(typeof value == "object" && value != null && Object.prototype.toString.call(value) !== "[object Array]")
							wrapObjFuncs(name + "[\"" + key + "\"]", value);
					}
					
					// Add a set attribute method to XObj.
					if(typeof obj.set == "undefined") {
						obj.set = function(key, value) {
							obj[key] = value;
							self.updateXObj(xObjName, xObj);
						};
					}
				};
				
				wrapObjFuncs(xObjName, xObj);
				
				return xObj;
			},
			_mixin: function(objContainer, obj) {
				if(typeof objContainer == "object" && typeof obj == "object" && objContainer != null && obj != null)
				{
					for(var key in obj)
					{
						// Not copy xframe properties.
						if(key.indexOf("_xframe_") == 0)
							continue;
						
						var value = obj[key];
						if(typeof value == "object")
						{
							if(value==null || Object.prototype.toString.call(value) == "[object Array]")
								objContainer[key] = value;
							else {
								// If objContainer[key] not object, create a empty one.
								if(typeof objContainer[key] != "object" || objContainer[key] == null)
									objContainer[key] = {};
								this._mixin(objContainer[key], value);
							}
						} else if(typeof value != "function") {
							// Other basic data type, copy directly.
							objContainer[key] = value;
						}
					}
				}
				return objContainer;
			},
			_connect: function(eventName, handler) {
				if (typeof window.addEventListener != 'undefined') {
					window.addEventListener(eventName, handler, false);
				} else if (typeof window.attachEvent != 'undefined') {
					window.attachEvent("on" + eventName, handleMessage);
				}
			}
		};
		
		window.xframe.init();
	}
	
	/* --- Module Definition --- */

	// Export xframe for CommonJS. If being loaded as an AMD module, define it as such.
	// Otherwise, just add `xframe` to the global object(window).
	if (typeof exports !== 'undefined') {
		if (typeof module !== 'undefined' && module.exports) {
			exports = module.exports = window.xframe;
		}
		exports.xframe = window.xframe;
	} else if (typeof define === 'function' && define.amd) {
		// Return the library as an AMD module:
		define([], function() {
			return window.xframe;
		});
	} else {
		// The root object is just the window object.
		//root["xframe"] = window.xframe;
	}

	// Root will be `window` in browser or `global` on the server:
})(this);