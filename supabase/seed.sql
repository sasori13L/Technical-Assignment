-- =============================================================================
-- Demo data. Run after schema.sql, in the Supabase SQL editor.
--
-- Contains 4 vessels (one inactive), 2 admins, 4 captains, 9 crew, and work
-- orders in every state. The first few orders are created by replaying the real
-- lifecycle as the real users (so the guard triggers and the event log run);
-- the rest is bulk filler to exercise pagination and the indexes.
-- =============================================================================

-- Vessels --------------------------------------------------------------------
insert into public.vessels (id, name, imo_number, vessel_type, is_active) values
  ('b0000000-0000-4000-8000-000000000001', 'MV Pacific Dawn',  '9321483', 'Container', true),
  ('b0000000-0000-4000-8000-000000000002', 'MV Cebu Star',     '9283291', 'Passenger', true),
  ('b0000000-0000-4000-8000-000000000003', 'MT Northern Light','9412634', 'Tanker',    true),
  ('b0000000-0000-4000-8000-000000000004', 'MV Old Harbor',    '8814275', 'Cargo',     false);

-- Users ----------------------------------------------------------------------
insert into public.users (id, full_name, email, role, is_active) values
  -- Admins
  ('a0000000-0000-4000-8000-000000000001', 'Marites Villanueva', 'marites.villanueva@fleetops.example', 'Admin',   true),
  ('a0000000-0000-4000-8000-000000000002', 'Daniel Okoye',       'daniel.okoye@fleetops.example',       'Admin',   true),
  -- Captains
  ('c0000000-0000-4000-8000-000000000001', 'Rafael Mendoza',     'rafael.mendoza@fleetops.example',     'Captain', true),
  ('c0000000-0000-4000-8000-000000000002', 'Elena Rojas',        'elena.rojas@fleetops.example',        'Captain', true),
  ('c0000000-0000-4000-8000-000000000003', 'Jonas Whitfield',    'jonas.whitfield@fleetops.example',    'Captain', true),
  ('c0000000-0000-4000-8000-000000000004', 'Dina Alcantara',     'dina.alcantara@fleetops.example',     'Captain', true),
  -- Crew
  ('d0000000-0000-4000-8000-000000000001', 'Noel Bautista',      'noel.bautista@fleetops.example',      'Crew',    true),
  ('d0000000-0000-4000-8000-000000000002', 'Liza Tan',           'liza.tan@fleetops.example',           'Crew',    true),
  ('d0000000-0000-4000-8000-000000000003', 'Carlo Reyes',        'carlo.reyes@fleetops.example',        'Crew',    true),
  ('d0000000-0000-4000-8000-000000000004', 'Mark Dizon',         'mark.dizon@fleetops.example',         'Crew',    true),
  ('d0000000-0000-4000-8000-000000000005', 'Ana Lopez',          'ana.lopez@fleetops.example',          'Crew',    true),
  ('d0000000-0000-4000-8000-000000000006', 'Paolo Cruz',         'paolo.cruz@fleetops.example',         'Crew',    true),
  ('d0000000-0000-4000-8000-000000000007', 'Ben Okafor',         'ben.okafor@fleetops.example',         'Crew',    true),
  ('d0000000-0000-4000-8000-000000000008', 'Sara Lindgren',      'sara.lindgren@fleetops.example',      'Crew',    true),
  ('d0000000-0000-4000-8000-000000000009', 'Rico Santos',        'rico.santos@fleetops.example',        'Crew',    false);

-- Vessel assignments (Paolo Cruz works two vessels; Dina is a relief captain) -
insert into public.vessel_assignments (vessel_id, user_id) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004'),
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000004'),
  ('b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000007'),
  ('b0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000008');

-- Demo work orders, replayed through the real guards ----------------------------
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('app_user_id', p_user)::text, false)
$$;

do $$
declare
  v_pd  constant uuid := 'b0000000-0000-4000-8000-000000000001';
  v_cs  constant uuid := 'b0000000-0000-4000-8000-000000000002';
  v_nl  constant uuid := 'b0000000-0000-4000-8000-000000000003';
  cap_pd constant uuid := 'c0000000-0000-4000-8000-000000000001';
  cap_cs constant uuid := 'c0000000-0000-4000-8000-000000000002';
  cap_nl constant uuid := 'c0000000-0000-4000-8000-000000000003';
  noel  constant uuid := 'd0000000-0000-4000-8000-000000000001';
  liza  constant uuid := 'd0000000-0000-4000-8000-000000000002';
  mark  constant uuid := 'd0000000-0000-4000-8000-000000000004';
  ana   constant uuid := 'd0000000-0000-4000-8000-000000000005';
  ben   constant uuid := 'd0000000-0000-4000-8000-000000000007';
  wo bigint;
begin
  -- 1. Open, never touched
  perform pg_temp.act_as(cap_pd);
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_pd, 'Replace hydraulic pump seal', 'Slow hydraulic leak at the deck crane pump. Oil film visible on the foundation plate after each lift.', noel);

  -- 2. In Progress
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_pd, 'Inspect life raft hydrostatic release', 'Annual inspection is due. The release unit expires next month.', liza)
  returning id into wo;
  perform pg_temp.act_as(liza);
  update public.work_orders set status = 'In Progress' where id = wo;

  -- 3. Done, waiting for the captain to review
  perform pg_temp.act_as(cap_pd);
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_pd, 'Galley extractor fan noise', 'Loud rattling from the galley extractor fan during service.', noel)
  returning id into wo;
  perform pg_temp.act_as(noel);
  update public.work_orders set status = 'In Progress' where id = wo;
  update public.work_orders set status = 'Done', solution = 'Tightened the loose mounting bracket and replaced two worn rubber isolators. Ran the fan for 30 minutes with no noise.' where id = wo;

  -- 4. Rejected once, back In Progress with a reason
  perform pg_temp.act_as(cap_pd);
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_pd, 'Fire damper test, engine room', 'Quarterly fire damper function test is overdue.', liza)
  returning id into wo;
  perform pg_temp.act_as(liza);
  update public.work_orders set status = 'In Progress' where id = wo;
  update public.work_orders set status = 'Done', solution = 'Tested dampers.' where id = wo;
  perform pg_temp.act_as(cap_pd);
  update public.work_orders set status = 'In Progress', rejection_reason = 'Please list which dampers were tested and attach the readings in the solution.' where id = wo;

  -- 5. Attested (closed)
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_pd, 'Renew bilge alarm float switch', 'Float switch in the forward bilge sticks intermittently.', noel)
  returning id into wo;
  perform pg_temp.act_as(noel);
  update public.work_orders set status = 'In Progress' where id = wo;
  update public.work_orders set status = 'Done', solution = 'Replaced the float switch, tested the alarm at high level, and logged the test.' where id = wo;
  perform pg_temp.act_as(cap_pd);
  update public.work_orders set attested_at = now() where id = wo;

  -- Cebu Star
  perform pg_temp.act_as(cap_cs);
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_cs, 'Passenger deck handrail corrosion', 'Section of handrail on deck 3 starboard is corroded and loose.', mark);
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_cs, 'Replace emergency lighting batteries', 'Three emergency lights in the stern corridor failed the monthly test.', ana)
  returning id into wo;
  perform pg_temp.act_as(ana);
  update public.work_orders set status = 'In Progress', solution = 'Batteries on order, drafting the replacement list.' where id = wo;

  -- Northern Light
  perform pg_temp.act_as(cap_nl);
  insert into public.work_orders (vessel_id, title, issue, assigned_to)
  values (v_nl, 'Cargo pump seal weeping', 'No. 2 cargo pump mechanical seal weeping during discharge.', ben);
end $$;

select set_config('request.jwt.claims', '', false);

-- Bulk filler (trusted context): ~240 orders across the three active vessels -----
do $$
declare
  v_vessels uuid[] := array['b0000000-0000-4000-8000-000000000001',
                            'b0000000-0000-4000-8000-000000000002',
                            'b0000000-0000-4000-8000-000000000003']::uuid[];
  v_titles text[] := array[
    'Lubricate steering gear linkage', 'Replace navigation light bulb', 'Service fire extinguishers',
    'Clean fuel oil purifier', 'Inspect mooring winch brake', 'Repair cabin door latch',
    'Calibrate radar display', 'Replace ballast pump gasket', 'Test emergency generator',
    'Descale freshwater generator', 'Repaint hatch coaming', 'Check CO2 system pressure'];
  v_issues text[] := array[
    'Reported during the weekly inspection round.', 'Flagged by the watch officer after the last port call.',
    'Due under the planned maintenance schedule.', 'Found during a routine safety check.',
    'Crew reported abnormal noise and vibration.'];
  i int;
  v_vessel uuid;
  v_captain uuid;
  v_crew uuid;
  v_state int;
  v_when timestamptz;
begin
  for i in 1..240 loop
    v_vessel := v_vessels[1 + (i % 3)];
    select a.user_id into v_captain
      from public.vessel_assignments a join public.users u on u.id = a.user_id
      where a.vessel_id = v_vessel and u.role = 'Captain' order by a.user_id limit 1;
    select a.user_id into v_crew
      from public.vessel_assignments a join public.users u on u.id = a.user_id
      where a.vessel_id = v_vessel and u.role = 'Crew' and u.is_active
      order by md5(a.user_id::text || i::text) limit 1;
    v_state := i % 4;
    v_when := now() - (i || ' hours')::interval;

    insert into public.work_orders
      (vessel_id, title, issue, solution, status, assigned_to, created_by, attested_by, attested_at, created_at, updated_at)
    values (
      v_vessel,
      v_titles[1 + (i % array_length(v_titles, 1))] || ' #' || i,
      v_issues[1 + (i % array_length(v_issues, 1))],
      case when v_state >= 2 then 'Completed per procedure and logged in the maintenance system.' end,
      case v_state when 0 then 'Open' when 1 then 'In Progress' else 'Done' end::public.work_order_status,
      v_crew, v_captain,
      case when v_state = 3 then v_captain end,
      case when v_state = 3 then v_when + interval '2 hours' end,
      v_when, v_when);
  end loop;
end $$;
