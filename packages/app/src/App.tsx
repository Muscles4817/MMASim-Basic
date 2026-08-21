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
import { OffersScreen } from './screens/OffersScreen';
import { EditorFighterScreen, EditorScreen } from './screens/EditorScreen';
import {
  EditorEntityScreen,
  EditorListScreen,
  editorTypeLabel,
} from './screens/EditorEntityScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PromotionHubScreen } from './screens/PromotionHubScreen';
import { CardBuilderScreen } from './screens/CardBuilderScreen';
import { PlanScreen } from './screens/PlanScreen';
import { ChampionsScreen } from './screens/ChampionsScreen';
import { PromoterRosterScreen } from './screens/PromoterRosterScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { InboxScreen } from './screens/InboxScreen';
import { planById } from './game/plans';

export function App() {
  const { route, replace } = useRouter();
  const { db, world, playerFighter, saveError } = useGame();

  const fighterName = (id: string): string | undefined => {
    const fighter = db.fighters.findById(id) as Fighter | undefined;
    return fighter ? displayName(fighter) : undefined;
  };

  // The card's own name in the header, not the word "Card". A promoter has several open at
  // once and a generic title makes them indistinguishable in a back stack.
  const planTitle = (id: string): string | undefined => planById(db, id)?.name;

  // A first-time visitor landing on the career hub with no fighter would see an empty
  // screen; send them to the one decision that has to be made first.
  useEffect(() => {
    /*
     * A promoter has no fighter, so the fighter hub's "you need to pick somebody" redirect
     * would bounce them to the start screen forever. Send them to their own hub instead —
     * `playerRole` finally deciding something is the whole of phase one's entry point.
     */
    if (route.name === 'hub' && world.playerRole === 'promoter') {
      replace({ name: 'promotion' });
      return;
    }
    if (route.name === 'hub' && !playerFighter) replace({ name: 'start' });
  }, [route.name, playerFighter, world.playerRole, replace]);

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
            {/*
              No longer promises a save export. There is no export anywhere in the app, and
              pointing the player at a feature that does not exist is at its worst precisely
              here — on the message shown while their progress is actively being lost.
            */}
            {saveError.message} Nothing since the last successful save will survive a reload.
            Deleting a save you have finished with, from the main menu, frees the space.
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
          // Wide: the fighter page runs analysis and promoter context in parallel, which is
          // exactly what desktop width is for.
          <Shell title={fighterName(route.id) ?? 'Fighter'} showBack wide>
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
      case 'contract':
        return (
          <Shell title="Your deal" showBack>
            <OffersScreen />
          </Shell>
        );
      // --- Promoter mode ---------------------------------------------------------------
      case 'promotion':
        return (
          // Wide: the dashboard's whole argument is that a promoter's decisions are
          // comparative, and a 56rem column forces every comparison to happen across a scroll.
          <Shell title="Promotion" wide>
            <PromotionHubScreen />
          </Shell>
        );
      case 'card':
        return (
          <Shell title="Cards" showBack>
            <CardBuilderScreen />
          </Shell>
        );
      case 'plan':
        return (
          <Shell title={planTitle(route.id) ?? 'Card'} showBack wide>
            {/* Keyed so moving between two cards remounts rather than carrying the previous
                card's open matchmaking panel into the new one. */}
            <PlanScreen key={route.id} id={route.id} />
          </Shell>
        );
      case 'champions':
        return (
          <Shell title="Championships" wide>
            <ChampionsScreen />
          </Shell>
        );
      case 'promoterRoster':
        return (
          <Shell title="Your roster">
            <PromoterRosterScreen />
          </Shell>
        );
      // --- Shared by every mode --------------------------------------------------------
      case 'calendar':
        return (
          <Shell title="Calendar">
            <CalendarScreen />
          </Shell>
        );
      case 'inbox':
        return (
          <Shell title="Inbox">
            <InboxScreen />
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
