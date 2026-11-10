import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupScreens } from '../dashboard/screens.js';

const story = (title, name) => ({ id: `${title}--${name}`.toLowerCase().replace(/\W+/g, '-'), title, name });
const summary = (stories) => Object.fromEntries([...groupScreens(stories)].map(([title, screens]) =>
  [title, screens.map((s) => `${s.name}: ${s.states.map((st) => st.label).join(', ')}`)]));

test('numbered stories with the same number are states of one screen', () => {
  assert.deepEqual(summary([
    story('Onboarding', '01 · Welcome'),
    story('Onboarding', '02 · Home name'),
    story('Onboarding', '02 · Home name empty'),
    story('Onboarding', '03 · Rooms'),
  ]), { Onboarding: ['01 · Welcome: Default', '02 · Home name: Default, Empty', '03 · Rooms: Default'] });
});

test('a name plus a state word is a state of that screen, even when not adjacent', () => {
  assert.deepEqual(summary([
    story('Settings', 'Notifications'),
    story('Settings', 'Preferences'),
    story('Settings', 'Notifications Denied'),
    story('Settings', 'Notifications Granted'),
  ]), { Settings: ['Notifications: Default, Denied, Granted', 'Preferences: Default'] });
});

test('different screens that only share a prefix stay separate', () => {
  assert.deepEqual(summary([
    story('Home', 'Create'),
    story('Home', 'Create Rooms'),
    story('Home', 'Rooms'),
  ]), { Home: ['Create: Default', 'Create Rooms: Default', 'Rooms: Default'] });
});

test('a state listed before its base still collapses, base first', () => {
  assert.deepEqual(summary([
    story('Main', 'Dashboard Empty'),
    story('Main', 'Dashboard'),
  ]), { Main: ['Dashboard: Default, Empty'] });
});

test('states never cross categories', () => {
  assert.deepEqual(summary([
    story('A', 'Tasks'),
    story('B', 'Tasks Empty'),
  ]), { A: ['Tasks: Default'], B: ['Tasks Empty: Default'] });
});

test('numbered states listed before their base keep the right base and labels', () => {
  assert.deepEqual(summary([
    story('Onboarding', '02 · Home name empty'),
    story('Onboarding', '02 · Home name'),
  ]), { Onboarding: ['02 · Home name: Default, Empty'] });
});

test('a number followed by a word with a dash is not a screen number', () => {
  assert.deepEqual(summary([
    story('Weather', '3-day forecast'),
    story('Weather', '3 · Settings'),
    story('Weather', '1-Tap Login'),
  ]), { Weather: ['3-day forecast: Default', '3 · Settings: Default', '1-Tap Login: Default'] });
});
