(function (ClearDbAction) {
    ClearDbAction[ClearDbAction["None"] = 0] = "None";
    ClearDbAction[ClearDbAction["Truncate"] = 1] = "Truncate";
    ClearDbAction[ClearDbAction["Drop"] = 2] = "Drop";
})(exports.ClearDbAction || (exports.ClearDbAction = {}));
var ClearDbAction = exports.ClearDbAction;
//# sourceMappingURL=defs.js.map