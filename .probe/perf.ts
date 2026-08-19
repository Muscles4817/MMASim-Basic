import { createMemoryAdapter, createNewGame, getWorld, setWorld } from '../packages/data/src/index.js';
import { createPlayerFighter, createRng, type CreateFighterSpec, type Gym } from '../packages/engine/src/index.js';
import { signFirstDeal } from '../packages/app/src/game/contracts.js';
import { advanceTo } from '../packages/app/src/game/clock.js';
const db=createNewGame({adapter:createMemoryAdapter(),seed:'p',era:'2026'});
const gym=(db.gyms.findAll() as unknown as Gym[]).slice().sort((a,b)=>a.quality-b.quality)[0]!;
const d0=getWorld(db).day;
const f=createPlayerFighter({id:'me',firstName:'A',lastName:'B',nationality:'GBR',sex:'male',
 divisionId:'mens-lightweight' as never,age:22,origin:{talent:'natural',discipline:'wrestling',attainment:'national'},
 build:'powerful',day:d0,gymId:gym.id} as CreateFighterSpec,createRng('p'));
db.fighters.upsert({...f,headCoachId:gym.headCoachId} as never); signFirstDeal(db,{...f,headCoachId:gym.headCoachId} as never);
setWorld(db,{playerRole:'fighter',playerFighterId:'me'}); db.save();
for (const [label,days] of [['a day',1],['a week',7],['a fortnight',14],['a month',30]] as const){
  const t=Date.now(); advanceTo(db, getWorld(db).day+days);
  console.log(`  "${label}" (${days}d): ${Date.now()-t}ms`);
}
