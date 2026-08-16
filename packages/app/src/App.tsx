import { useEffect } from 'react';
import { displayName, type Fighter } from '@mmasim/engine';
import { useGame } from './state/GameProvider';
import { useRouter } from './state/router';
import { Shell } from './shell/Shell';
import { UpdatePrompt } from './shell/UpdatePrompt';
import { Alert } from './ui/signals';
import { StartScreen } from './screens/StartScreen';
import { CreateFighterScreen } from './screens/CreateFighterScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { HubScreen } from './screens/HubScreen';
import { RosterScreen } from './screens/RosterScreen';
import { FighterScreen } from './screens/FighterScreen';
import { CampScreen } from './screens/CampScreen';
import { FightScreen } from './screens/FightScreen';
import { RankingsScreen } from './screens/RankingsScreen';
import { EditorFighterScreen, EditorScreen } from './screens/EditorScreen';
import {
  EditorEntityScreen,
  EditorListScreen,
  editorTypeLabel,
} from './screens/EditorEntityScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const { route, replace } = useRouter();
  const { db, playerFighter, saveError } = useGame();

  const fighterName = (id: string): string | undefined => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : undefined;
  };

  // A first-time visitor landing on the career hub with no fighter would see an empty
  // screen; send them to the one decision that has to be made first.
  useEffect(() => {
    if (route.name === 'hub' && !playerFighter) replace({ name: 'start' });
  }, [route.name, playerFighter, replace]);

  return (
    <>
      {/* Renders nothing unless a newer build is genuinely waiting. Mounted here rather
          than per-screen so a pending update survives navigation. */}
      <UpdatePrompt />
      {/*
        A failed save was surfaced on the Settings screen and nowhere else, so a player whose
        storage quota is full could fight, train and win for hours with nothing persisting
        and only find out if they happened to open Settings. It belongs everywhere.
      */}
      {saveError && (
        <div style={{ padding: 'var(--space-3) var(--space-4) 0' }}>
          <Alert tone="danger" title="Your progress is not being saved">
            {saveError.message} Nothing since the last successful save will survive a reload — freeing
            some browser storage, or exporting your save from Settings, will fix it.
          </Alert>
        </div>
      )}
      {renderRoute()}
    </>
  );

  function renderRoute() {
    switch (route.name) {
      case 'start':
        return (
          <Shell title="New career">
            <StartScreen />
          </Shell>
        );
      case 'create':
        return (
          <Shell title="Create a fighter" showBack>
            <CreateFighterScreen />
          </Shell>
        );
      case 'training':
        return (
          <Shell title="Training" showBack>
            <TrainingScreen />
          </Shell>
        );
      case 'hub':
        return (
          <Shell title="Career">
            <HubScreen />
          </Shell>
        );
      case 'roster':
        return (
          <Shell title="Roster">
            <RosterScreen />
          </Shell>
        );
      case 'fighter':
        return (
          // The h1 names the subject, not the category. "Fighter" told a screen-reader user
          // and anyone navigating by heading precisely nothing about whose page this is.
          <Shell title={fighterName(route.id) ?? 'Fighter'} showBack>
            <FighterScreen key={route.id} id={route.id} />
          </Shell>
        );
      case 'camp':
        return (
          <Shell title="Fight camp" showBack>
            <CampScreen />
          </Shell>
        );
      case 'fight':
        return (
          <Shell title="Fight night">
            <FightScreen boutId={route.boutId} />
          </Shell>
        );
      case 'rankings':
        return (
          <Shell title="Rankings">
            <RankingsScreen />
          </Shell>
        );
      case 'editor':
        return (
          <Shell title="Editor">
            <EditorScreen />
          </Shell>
        );
      case 'editorFighter':
        return (
          <Shell title="Edit fighter" showBack>
            {/* Keyed so navigating between two fighters remounts. Without it the component
                reuses its draft state and Save writes the previously-loaded fighter. */}
            <EditorFighterScreen key={route.id} id={route.id} />
          </Shell>
        );
      case 'editorList':
        return (
          <Shell title={editorTypeLabel(route.kind)} showBack>
            <EditorListScreen key={route.kind} kind={route.kind} />
          </Shell>
        );
      case 'editorEntity':
        return (
          <Shell title={editorTypeLabel(route.kind)} showBack>
            {/* Keyed for the same reason the fighter editor is: without it the draft state
                survives a navigation and Save writes the previously-loaded entity. */}
            <EditorEntityScreen key={`${route.kind}:${route.id}`} kind={route.kind} id={route.id} />
          </Shell>
        );
      case 'settings':
        return (
          <Shell title="Settings">
            <SettingsScreen />
          </Shell>
        );
      default:
        return (
          <Shell title="Career">
            <HubScreen />
          </Shell>
        );
    }
  }
}
