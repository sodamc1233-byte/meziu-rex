import { useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { OfflineIndicator } from './components/PWAInstallButton';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { MeziuGameEngine } from './game/engine';
import { MAX_STEPS } from './game/rules';
import type { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  state: 'title',
  steps: 0,
  maxSteps: MAX_STEPS,
  inventory: [],
  elapsedSec: 0,
  bestTimeSec: null,
  respawnCountdown: 0,
  dialogue: null,
  speaker: null,
  hintPrompt: null,
  muted: false,
  treeLooted: false,
  gateUnlocked: false,
  comboWindowActive: false,
  deathReason: null,
  wingBuffSec: 0,
  pteroDefeatedCount: 0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MeziuGameEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [autoDownloaded, setAutoDownloaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new MeziuGameEngine(canvas, (nextHud) => {
      setHud(nextHud);
    });
    engineRef.current = engine;

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.startGame();
    } else if (params.get('dl') === '1') {
      setReleaseModalOpen(true);
      setAutoDownloaded(true);
      const a = document.createElement('a');
      a.href = './Meziu-Rex-Nekame.html';
      a.download = 'Meziu-Rex-Nekame.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (params.get('tai') === '1') {
      setReleaseModalOpen(true);
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#1f251e]">
      {/* Isolated Canvas Container */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          data-testid="meziu-canvas"
          className="block w-full h-full"
        />
      </div>

      {/* Title Screen */}
      {hud.state === 'title' && (
        <TitleOverlay
          onStart={() => {
            setReleaseModalOpen(false);
            engineRef.current?.startGame();
          }}
          muted={hud.muted}
          onToggleMute={() => engineRef.current?.toggleMute()}
          downloadModalOpen={releaseModalOpen}
          onDownloadModalChange={setReleaseModalOpen}
          autoDownloaded={autoDownloaded}
        />
      )}

      {/* Active Gameplay HUD */}
      {hud.state === 'playing' && (
        <GameHud
          hud={hud}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onPause={() => engineRef.current?.pauseGame()}
          onRestart={() => engineRef.current?.restartLevel()}
          onInspectSlot={(idx) => engineRef.current?.inspectInventorySlot(idx)}
          onDirection={(dir, active) => engineRef.current?.setVirtualDirection(dir, active)}
          onJump={(pressed) => engineRef.current?.triggerJump(pressed)}
          onPunch={() => engineRef.current?.triggerPunch()}
          onKick={() => engineRef.current?.triggerKick()}
        />
      )}

      {/* Paused / Game Over / Victory Modal */}
      <StatusModal
        hud={hud}
        onResume={() => engineRef.current?.resumeGame()}
        onRestart={() => engineRef.current?.restartLevel()}
        onRespawn={() => engineRef.current?.respawnAtEgg()}
        onTitle={() => engineRef.current?.returnToTitle()}
      />

      <OfflineIndicator />
    </main>
  );
}
