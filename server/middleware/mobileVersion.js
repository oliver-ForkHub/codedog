const { SystemConfig } = require('../models');
const DEFAULTS = { mobile_android_min_version:'1.1.0', mobile_android_latest_version:'1.1.1', mobile_android_update_url:'https://github.com/txcxgzs/codedog/releases/download/mobile-latest/codedog-mobile.apk', mobile_android_update_message:'当前版本已停止服务，请更新后继续使用。' };
let cache=null;
function parseVersion(v){const m=String(v||'').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);return m?m.slice(1).map(Number):null;}
function compareVersions(l,r){const a=parseVersion(l),b=parseVersion(r);if(!a||!b)return null;for(let i=0;i<3;i+=1)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0;}
function invalidateMobileVersionCache(){cache=null;}
async function getMobileVersionPolicy(){
    if(cache)return cache;
    const entries=[];
    for(const [config_key,config_value] of Object.entries(DEFAULTS)){
        const[row]=await SystemConfig.findOrCreate({where:{config_key},defaults:{config_value}});
        entries.push([config_key,row.config_value||config_value]);
    }
    const v=Object.fromEntries(entries);
    cache={platform:'android',minimum_version:v.mobile_android_min_version,latest_version:v.mobile_android_latest_version,update_url:v.mobile_android_update_url,message:v.mobile_android_update_message};
    return cache;
}
async function mobileVersionGate(req,res,next){try{const platform=String(req.get('x-app-platform')||'').toLowerCase(),version=String(req.get('x-app-version')||'');const mobile=platform==='android'||req.path==='/users/mobile/login'||/okhttp/i.test(req.get('user-agent')||'');if(!mobile)return next();const policy=await getMobileVersionPolicy(),comparison=compareVersions(version,policy.minimum_version);if(comparison===null||comparison<0)return res.status(426).json({code:426,msg:policy.message,data:{...policy,current_version:version||null,force_update:true}});return next();}catch(error){return next(error);}}
module.exports={DEFAULTS,compareVersions,getMobileVersionPolicy,invalidateMobileVersionCache,mobileVersionGate};
