import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { captchaApi, type GeetestRegister } from '../api/captcha';
import { setCaptchaHandler, type CaptchaFields } from '../api/client';
import { colors } from '../theme';

// 修复 M14：并发验证码请求串行化。此前用队列 + shift() 会把"最新场景"的验证结果
// resolve 给"最早请求"，并把最新请求的 resolver 遗留在队列里永挂（子代理复审发现）。
// 现模型：currentResolve 持有"当前弹窗对应请求"的 resolver；waitQueue 存排队中的请求。
// close() 只 resolve currentResolve（对应弹窗的那一个），队列非空则推进到下一个请求
// 并展示其场景，确保每个请求拿到的是自己场景的验证结果。
type Queued = { scene: string; kind: 'geetest' | 'hcaptcha'; resolve: (value: CaptchaFields | null) => void };

export function CaptchaProvider({ children }: { children: React.ReactNode }) {
  const currentResolve = useRef<((value: CaptchaFields | null) => void) | null>(null);
  const waitQueue = useRef<Queued[]>([]);
  const sceneRef = useRef('global');
  const kindRef = useRef<'geetest' | 'hcaptcha'>('geetest');
  const [visible, setVisible] = useState(false);
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');

  // 取出一个排队请求并展示其场景的验证码弹窗。
  // 关键：currentResolve 必须在 await 之前同步占用，否则"拉配置的异步窗口"内新请求会看到
  // currentResolve=null 而直接抢占 showNext，回到覆盖/错配（子代理复审后强化的 race 修复）。
  const showNext = async (item: Queued) => {
    sceneRef.current = item.scene;
    kindRef.current = item.kind;
    setError('');
    currentResolve.current = item.resolve;
    try {
      if (item.kind === 'hcaptcha') {
        const config = await captchaApi.hcaptchaConfig();
        if (!config.enabled || !config.site_key) {
          currentResolve.current = null;
          item.resolve(null);
          return advance();
        }
        await captchaApi.hcaptchaShow(item.scene).catch(() => null);
        setHtml(buildHcaptchaHtml(config.site_key));
      } else {
        const config = await captchaApi.config();
        if (!config.enabled || !config.scenes[item.scene]) {
          currentResolve.current = null;
          item.resolve(null);
          return advance();
        }
        await captchaApi.show(item.scene).catch(() => null);
        const registration = await captchaApi.register();
        setHtml(buildHtml(registration, config.product || 'popup'));
      }
      setVisible(true);
    } catch (e) {
      // 保留原行为：加载失败时展示错误，用户点取消后 resolve(null) 并推进队列。
      setError(e instanceof Error ? e.message : '验证码加载失败');
      setVisible(true);
    }
  };

  // 弹窗关闭后，若还有排队请求则推进到下一个；否则彻底收起弹窗。
  const advance = () => {
    const next = waitQueue.current.shift();
    if (next) {
      showNext(next);
    } else {
      setVisible(false);
      setHtml('');
    }
  };

  useEffect(() => {
    setCaptchaHandler(async (scene, kind) => {
      return await new Promise<CaptchaFields | null>((resolve) => {
        const item: Queued = { scene, kind, resolve };
        // 无正在展示的弹窗则直接展示；否则排队等当前关闭后推进。
        if (!currentResolve.current && waitQueue.current.length === 0) {
          showNext(item);
        } else {
          waitQueue.current.push(item);
        }
      });
    });
    return () => setCaptchaHandler(null);
  }, []);

  // 修复 M14：close 只 resolve 当前弹窗对应的请求（currentResolve），杜绝错配。
  const close = (value: CaptchaFields | null) => {
    const resolve = currentResolve.current;
    currentResolve.current = null;
    if (resolve) resolve(value);
    advance();
  };

  const receive = async (raw: string) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'hcaptcha') {
        await captchaApi.hcaptchaVerify(data.token, sceneRef.current);
        close({});
      } else if (data.type === 'success') {
        close(data.payload);
      } else if (data.type === 'error') {
        setError(data.message || '验证加载失败');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败，请重试');
    }
  };

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => close(null)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>安全验证</Text>
              <Pressable onPress={() => close(null)}>
                <Text style={styles.close}>取消</Text>
              </Pressable>
            </View>
            {error ? (
              <View style={styles.center}>
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : html ? (
              <WebView
                originWhitelist={['*']}
                source={{ html }}
                javaScriptEnabled
                domStorageEnabled
                thirdPartyCookiesEnabled
                sharedCookiesEnabled
                style={styles.web}
                onMessage={(event) => void receive(event.nativeEvent.data)}
              />
            ) : (
              <View style={styles.center}>
                <ActivityIndicator color={colors.ink} />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function buildHtml(data: GeetestRegister, product: string) {
  const payload = JSON.stringify({ ...data, product }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:20px;font-family:sans-serif}#captcha{min-height:48px}</style><script src="https://static.geetest.com/v4/gt4.js"></script></head><body><div id="captcha"></div><script>const cfg=${payload};function send(v){window.ReactNativeWebView.postMessage(JSON.stringify(v))}initGeetest4({captchaId:cfg.captcha_id,product:cfg.product,nativeButton:{width:'100%'}},function(c){c.onReady(function(){if(cfg.product==='bind'||cfg.product==='popup')c.showCaptcha()});c.onSuccess(function(){const r=c.getValidate();send({type:'success',payload:{geetest_lot_number:r.lot_number,geetest_captcha_output:r.captcha_output,geetest_pass_token:r.pass_token,geetest_gen_time:r.gen_time}})});c.onError(function(){send({type:'error',message:'验证码加载出错'})});if(cfg.product==='float')c.appendTo('#captcha')});</script></body></html>`;
}

// 修复 M11：自建 WebView 内 hCaptcha 无法自动检测 hostname，需显式提供 host 参数（官方要求）。
// 此处使用固定的站点 host 标识，不从不可信 URL 读取，仅用于 sitekey 归属与统计。
function buildHcaptchaHtml(siteKey: string) {
  const key = JSON.stringify(siteKey).replace(/</g, '\\u003c');
  // host 用裸域名（不含协议/端口），从 API 站点推导；无法推导时用占位 app host。
  const host = 'codedog.app';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;display:flex;justify-content:center}</style><script src="https://js.hcaptcha.com/1/api.js?host=${host}" async defer></script></head><body><div class="h-captcha" data-sitekey=${key} data-callback="done" data-error-callback="failed"></div><script>function done(token){window.ReactNativeWebView.postMessage(JSON.stringify({type:'hcaptcha',token:token}))}function failed(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'hCaptcha 验证失败'}))}</script></body></html>`;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,18,30,.45)' },
  card: { width: '100%', maxWidth: 420, height: 300, overflow: 'hidden', borderRadius: 22, backgroundColor: colors.surface },
  header: { height: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border },
  title: { fontSize: 16, fontWeight: '900', color: colors.ink },
  close: { fontSize: 13, fontWeight: '800', color: colors.muted },
  web: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  error: { textAlign: 'center', color: colors.danger },
});
