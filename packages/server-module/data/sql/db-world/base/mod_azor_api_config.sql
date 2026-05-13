--
-- mod-azor-api: runtime key/value config table.
--
-- Lives in acore_world. Edited live by operators; the module re-reads on
-- WorldScript::OnStartup and on every `.reload config` (via OnAfterConfigLoad).
-- INSERT IGNORE on seeds so existing operator-edited values are never clobbered
-- on restart / db_assembler re-apply.
--
-- Column names match docs/PLAN.md (`key`, `value`); reserved-word risk is
-- contained by always backticking them in queries.
--

CREATE TABLE IF NOT EXISTS `mod_azor_api_config` (
    `key`   VARCHAR(64)  NOT NULL,
    `value` VARCHAR(256) NOT NULL,
    PRIMARY KEY (`key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Stage 2 seeds. Stage 3 (interactions) adds gift.* keys; Stage 5 adds link.*.
-- Keep this list minimal — anything not actually read by the module yet stays out
-- so an operator inspecting the table isn't misled into thinking it's wired up.
INSERT IGNORE INTO `mod_azor_api_config` (`key`, `value`) VALUES
    ('realm.online.default_limit', '50'),
    ('realm.online.max_limit',     '500'),
    -- Stage 3 — `gift` interaction defaults. `<type>.cooldown_ms` and
    -- `<type>.min_level` are the generic keys the interact handler consults;
    -- `gift.item_entry` is gift-specific (the mailed item).
    -- 86_400_000 ms = 24h.
    ('gift.cooldown_ms',           '86400000'),
    ('gift.item_entry',            '11966'),
    ('gift.min_level',             '10');
