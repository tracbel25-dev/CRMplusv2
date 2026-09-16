'use client';

export function AppLoadingScreen({ label = 'Carregando' }: { label?: string }) {
  return <main className="crm-loading-screen" role="status" aria-live="polite" aria-label={label}>
    <div className="crm-loading-spinner" aria-hidden="true"><span /></div>
    <span className="crm-loading-sr">{label}</span>
    <style jsx>{`
      .crm-loading-screen{position:fixed;inset:0;z-index:9999;min-height:100dvh;display:grid;place-items:center;background:#050505;color:#fff}
      .crm-loading-spinner{position:relative;width:58px;height:58px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#fff;border-right-color:rgba(255,255,255,.62);animation:crm-loading-spin .82s linear infinite}
      .crm-loading-spinner:before,.crm-loading-spinner:after{content:'';position:absolute;left:50%;top:50%;border-radius:999px;background:rgba(255,255,255,.7);transform:translate(-50%,-50%)}
      .crm-loading-spinner:before{width:13px;height:2px}.crm-loading-spinner:after{width:2px;height:13px}
      .crm-loading-spinner span{position:absolute;inset:8px;border:1px solid rgba(255,255,255,.08);border-radius:50%}
      .crm-loading-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      @keyframes crm-loading-spin{to{transform:rotate(360deg)}}
      @media(prefers-reduced-motion:reduce){.crm-loading-spinner{animation-duration:1.8s}}
    `}</style>
  </main>;
}
