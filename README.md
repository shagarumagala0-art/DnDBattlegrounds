================================================================================
PROJECT REQUIREMENTS DOCUMENT: DnD Arena Pro
================================================================================

1. CORE SYSTEM REQUIREMENTS
--------------------------------------------------------------------------------
- Mobile-First Architecture: Must be optimized for Android/iOS WebViews.
- Gesture Control: Explicit disabling of native browser "Pull-to-Refresh" and 
  "Overscroll-Bounce" to ensure UI stability during grid interaction.
- Local Data Fetching: Support for loading multiple .json files from a local 
  directory (/data/) and merging them into a unified searchable database.
- 5etools Compatibility: Automatic parsing and cleaning of 5etools-specific 
  markup tags (e.g., {@dice}, {@hit}, {@atk}) for human-readable display.

2. BATTLE ARENA (GRID) REQUIREMENTS
--------------------------------------------------------------------------------
- Interactive Grid: A 20x20 cell layout (min. 60px touch targets).
- Token Management: Support for two distinct token types:
    * Monster Tokens: Red/Gold theme with 3-letter name abbreviations.
    * Player Tokens: Blue/Silver theme for imported characters.
- Movement Logic: Tap-to-select and tap-to-move mechanics for all active tokens.
- Visual Feedback: Highlighting of the active token and its intended 
  destination/path.

3. MONSTER DATABASE & SEARCH REQUIREMENTS
--------------------------------------------------------------------------------
- Unified Search: Real-time filtering across all loaded JSON bestiaries.
- Quick-View UI: Results list must display Name, HP, AC, and CR at a glance.
- Comprehensive Statblocks: Full-screen or bottom-sheet overlay displaying:
    * Ability Scores (STR, DEX, CON, INT, WIS, CHA).
    * Hit Points (Average and Formula), Armor Class, and Speed.
    * Traits, Actions, Legendary Actions, Reactions, and Resistances.

4. DICECLOUD INTEGRATION REQUIREMENTS
--------------------------------------------------------------------------------
- URL-Based Import: Support for fetching character data via public Dicecloud 
  share links (URLs).
- Live Data Sync: Connection to the Dicecloud API to retrieve real-time stats:
    * Current Hit Points vs. Maximum Hit Points.
    * Current Armor Class (AC).
    * Attribute Modifiers.
- PC Token Generation: Automatic creation of player-controlled tokens based 
  on imported link data.

5. COMBAT ENGINE REQUIREMENTS
--------------------------------------------------------------------------------
- Initiative Tracker: 
    * Automated rolling for Monsters (d20 + Dex mod).
    * Manual or synced input for Player Characters.
    * Real