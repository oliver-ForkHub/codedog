import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL, APP_VERSION, setUpgradeHandler, type UpgradePolicy } from '../api/client';
import { colors } from '../theme';

export function VersionGate({children}:{children:React.ReactNode}) {
  const [checking,setChecking]=useState(true); const [policy,setPolicy]=useState<UpgradePolicy|null>(null); const [error,setError]=useState('');
  const check=async()=>{setChecking(true);setError('');try{const response=await fetch(`${API_BASE_URL}/mobile/version`,{headers:{Accept:'application/json','X-App-Platform':'android','X-App-Version':APP_VERSION,'X-App-Build':'4'}});const body=await response.json();if(!response.ok||body.code!==200)throw new Error(body.msg||'版本检查失败');const data=body.data as UpgradePolicy;if(compare(APP_VERSION,data.minimum_version)<0)setPolicy({...data,force_update:true});else setPolicy(null);}catch(e){setError(e instanceof Error?e.message:'版本检查失败');}finally{setChecking(false);}};
  useEffect(()=>{setUpgradeHandler(setPolicy);void check();return()=>setUpgradeHandler(null);},[]);
  if(checking)return <View style={styles.center}><ActivityIndicator color={colors.ink}/><Text style={styles.hint}>正在检查版本…</Text></View>;
  if(policy?.force_update)return <View style={styles.center}><View style={styles.card}><Text style={styles.title}>需要更新 App</Text><Text style={styles.version}>当前 {APP_VERSION} · 最新 {policy.latest_version}</Text><Text style={styles.message}>{policy.message||'当前版本已停止服务，请更新后继续使用。'}</Text><Pressable onPress={()=>void Linking.openURL(policy.update_url)} style={styles.button}><Text style={styles.buttonText}>立即更新</Text></Pressable></View></View>;
  if(error)return <View style={styles.center}><View style={styles.card}><Text style={styles.title}>暂时无法进入</Text><Text style={styles.message}>无法完成版本检查，请确认网络后重试。</Text><Pressable onPress={()=>void check()} style={styles.button}><Text style={styles.buttonText}>重新检查</Text></Pressable></View></View>;
  return <>{children}</>;
}
function compare(left:string,right:string){const a=left.split('.').map(Number),b=right.split('.').map(Number);for(let i=0;i<3;i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0)?1:-1;}return 0;}
const styles=StyleSheet.create({center:{flex:1,padding:24,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},hint:{marginTop:12,color:colors.muted,fontSize:13},card:{width:'100%',padding:24,borderRadius:24,backgroundColor:colors.surface},title:{color:colors.ink,fontSize:25,fontWeight:'900'},version:{marginTop:8,color:colors.muted,fontSize:12},message:{marginTop:18,color:colors.muted,fontSize:14,lineHeight:23},button:{height:50,marginTop:22,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:colors.primary},buttonText:{color:colors.ink,fontSize:15,fontWeight:'900'}});
