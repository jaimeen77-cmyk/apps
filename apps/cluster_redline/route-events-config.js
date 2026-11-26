'use strict';
const INTERFACE='de.bmw.infotainment.navigation.guiding.GuidanceEventList';
const INSTANCE='Main_Instance',METHODS=['queryContent'];
function filterRouteEvents(manifest,catalog,optional,missing) {
    const proxy=manifest.proxies&&manifest.proxies[INTERFACE];
    if(!proxy||!optional||!optional[INTERFACE])return manifest;
    const definition=catalog.interfaces&&catalog.interfaces[INTERFACE];
    const instances=catalog.instanceIDs&&catalog.instanceIDs[INTERFACE];
    const method=definition&&definition.methods&&definition.methods.queryContent;
    if(!definition||definition.serviceId!==64283||!definition.version||definition.version.major!==5||
        !instances||instances[INSTANCE]!==128||!method||method.methodId!==4) {
        delete manifest.proxies[INTERFACE];if(missing)missing[INTERFACE]=optional[INTERFACE];return manifest;
    }
    // queryContent is a one-shot read: do not register views or grant setters.
    proxy.attributes={};proxy.methods=METHODS.slice();proxy.instances=INSTANCE;
    delete proxy.broadcasts;
    return manifest;
}
function queryParams() {
    // These enum names and parameters returned SLIGHT_LEFT / 799 METER on the
    // supplied Android Auto vehicle probe. Numeric enums were rejected.
    // 1.3.75: also the main road's and the passive junctions' events, up to 10, as cluster-metrics asks for them on a
    // G30 (facts only): more of the route's turns for the next turn, and the highway's junctions (route-events.js
    // leaves out a passive one the HUD does not draw).
    return {viewConfigs:[{
        viewport:{startPoint:{anchorPoint:{standardReferencePoint:'CCP'},offsets:[]},maxElementCount:10,endPoints:[],includedTypes:['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_ALONG_MAIN_ROAD','INCLUDE_DESTINATIONS','INCLUDE_PASSIVE_MANEUVER_JCT']},
        options:[],minimumUpdateIntervalMs:1000,segmentItemRasterLength:100
    }]};
}
module.exports={INTERFACE,INSTANCE,METHODS,filterRouteEvents,queryParams};
