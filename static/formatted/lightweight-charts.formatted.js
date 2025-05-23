/*!
 * @license
 * TradingView Lightweight Charts™ v5.0.7
 * Copyright (c) 2025 TradingView, Inc.
 * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
 */
!function() {
    "use strict";
    
    // Default configuration for charts
    const t = {
        title: "",
        visible: true,
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineSource: 0,
        priceLineWidth: 1,
        priceLineColor: "",
        priceLineStyle: 2,
        baseLineVisible: true,
        baseLineWidth: 1,
        baseLineColor: "#B2B5BE",
        baseLineStyle: 0,
        priceFormat: {
            type: "price",
            precision: 2,
            minMove: 0.01
        }
    };
    
    var i, s;
    
    // Line dash style setter function
    function n(t, i) {
        const s = {
            0: [],
            1: [t.lineWidth, t.lineWidth],
            2: [2 * t.lineWidth, 2 * t.lineWidth],
            3: [6 * t.lineWidth, 6 * t.lineWidth],
            4: [t.lineWidth, 4 * t.lineWidth]
        }[i];
        t.setLineDash(s);
    }
    
    // Draw horizontal line function
    function e(t, i, s, n) {
        t.beginPath();
        const e = t.lineWidth % 2 ? 0.5 : 0;
        t.moveTo(s, i + e);
        t.lineTo(n, i + e);
        t.stroke();
    }
    
    // Assertion function
    function r(t, i) {
        if (!t) throw new Error("Assertion failed" + (i ? ": " + i : ""));
    }
    
    // Value checking functions
    function h(t) {
        if (void 0 === t) throw new Error("Value is undefined");
        return t;
    }
    
    function a(t) {
        if (null === t) throw new Error("Value is null");
        return t;
    }
    
    function l(t) {
        return a(h(t));
    }
    
    // Enum definitions
    !function(t) {
        t[t.Simple = 0] = "Simple";
        t[t.WithSteps = 1] = "WithSteps";
        t[t.Curved = 2] = "Curved";
    }(i || (i = {}));
    
    !function(t) {
        t[t.Solid = 0] = "Solid";
        t[t.Dotted = 1] = "Dotted";
        t[t.Dashed = 2] = "Dashed";
        t[t.LargeDashed = 3] = "LargeDashed";
        t[t.SparseDotted = 4] = "SparseDotted";
    }(s || (s = {}));
    
    // Event handler class
    class o {
        constructor() {
            this.t = [];
        }
        
        i(t, i, s) {
            const n = {
                h: t,
                l: i,
                o: true === s
            };
            this.t.push(n);
        }
        
        _(t) {
            const i = this.t.findIndex((i => t === i.h));
            i > -1 && this.t.splice(i, 1);
        }
        
        u(t) {
            this.t = this.t.filter((i => i.l !== t));
        }
        
        p(t, i, s) {
            const n = [...this.t];
            this.t = this.t.filter((t => !t.o));
            n.forEach((n => n.h(t, i, s)));
        }
        
        v() {
            return this.t.length > 0;
        }
        
        m() {
            this.t = [];
        }
    }
    
    // Object merging function
    function _(t, ...i) {
        for (const s of i)
            for (const i in s)
                void 0 !== s[i] && 
                Object.prototype.hasOwnProperty.call(s, i) && 
                !["__proto__", "constructor", "prototype"].includes(i) && 
                ("object" != typeof s[i] || void 0 === t[i] || Array.isArray(s[i]) ? 
                    t[i] = s[i] : 
                    _(t[i], s[i]));
        return t;
    }
    
    // Type checking functions
    function u(t) {
        return "number" == typeof t && isFinite(t);
    }
    
    function c(t) {
        return "number" == typeof t && t % 1 == 0;
    }
    
    function d(t) {
        return "string" == typeof t;
    }
    
    function f(t) {
        return "boolean" == typeof t;
    }
    
    // Deep clone function
    function p(t) {
        const i = t;
        if (!i || "object" != typeof i) return i;
        
        let s, n, e;
        for (n in s = Array.isArray(i) ? [] : {}, i)
            i.hasOwnProperty(n) && (e = i[n], s[n] = e && "object" == typeof e ? p(e) : e);
        
        return s;
    }
    
    function v(t) {
        return null !== t;
    }
    
    function m(t) {
        return null === t ? void 0 : t;
    }
    
    // Default font family
    const w = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
    
    // Font string generator
    function g(t, i, s) {
        return void 0 === i && (i = w), `${s = void 0 !== s ? `${s} ` : ""}${t}px ${i}`;
    }
    
    // More classes and functions follow...
    // This is just the beginning of the file to demonstrate the formatting