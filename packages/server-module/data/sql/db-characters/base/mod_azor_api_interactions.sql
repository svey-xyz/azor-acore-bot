--
-- mod-azor-api: per-character interaction audit log (Stage 3).
--
-- Single source of truth for cooldown enforcement AND historical record of
-- every `.azor api character interact` call (today: `gift`; tomorrow: any
-- new interaction type — the discriminator is the `interaction_type` column,
-- no schema change required for new types).
--
-- Cooldown lookup is `MAX(occurred_at) WHERE guid = ? AND interaction_type = ?`
-- — O(1) on the composite index. The index column order matters: queries
-- always filter by `guid` first, then `interaction_type`, then range/order on
-- `occurred_at`, which is exactly the leftmost prefix the index serves.
--
-- No FK to `characters.guid` — see the `azerothcore-module-character-persistence`
-- skill. Cleanup is handled by `AzorApiPlayerScript::OnPlayerDelete` in C++.
--

CREATE TABLE IF NOT EXISTS `mod_azor_api_interactions` (
    `id`               BIGINT UNSIGNED                                NOT NULL AUTO_INCREMENT,
    `guid`             INT(10) UNSIGNED                               NOT NULL COMMENT 'characters.guid (low GUID)',
    `interaction_type` VARCHAR(32)                                    NOT NULL COMMENT 'extensible enum: gift, ...',
    `source_type`      ENUM('discord','website','admin','system')     NOT NULL,
    `source_id`        VARCHAR(64)                                    NOT NULL COMMENT 'opaque external id (discord user id, website session, ...)',
    `payload_json`     JSON                                           NULL     COMMENT 'optional per-call payload supplied by the caller',
    `occurred_at`      BIGINT UNSIGNED                                NOT NULL COMMENT 'epoch ms; storage type matches @azor/shared',
    PRIMARY KEY (`id`),
    KEY `idx_guid_type_time` (`guid`, `interaction_type`, `occurred_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
