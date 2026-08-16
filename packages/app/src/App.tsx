import { useEffect } from 'react';
import { useGame } from './state/GameProvider';
import { useRouter } from './state/router';
import { Shell } from './shell/Shell';
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
import { SettingsScreen } from './screens/SettingsScreen';

export function App() {
  const { route, replace } = useRouter();
  const { playerFighter } = useGame();

  // A first-time visitor landing on the career hub with no fighter would see an empty
  // screen; send them to the one decision that has to be made first.
  useEffect(() => {
    if (route.name === 'hub' && !playerFighter) replace({ name: 'start' });
  }, [route.name, playerFighter, replace]);

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
        <Shell title="Fighter" showBack>
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
