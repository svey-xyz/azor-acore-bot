interface _account {
	id: number;
	username: string;
	email: string;
	joindate: string;
	last_ip: string;
	last_login: string;
	online: number;
	os: string;
	
	[string: string]: any; // Allow additional properties
}

interface _character {
	guiid: number;
	account: number;
	name: string;
	race: number;
	class: number;
	gender: number;
	level: number;
	xp: number;
	money: number;
	skin: number;
	face: number;
	hairstyle: number;
	haircolor: number;
	facialStyle: number;
	bankSlots: number;
	restState: number;
	playerFlags: number;
	position_x?: number;
	position_y?: number;
	position_z?: number;
	map?: number;
	instance_id?: number;
	instance_mode_mask: number;
	orientation?: number;
	taximask: string;
	online: number;
	cinematic: number;
	totaltime: number;
	leveltime: number;
	logout_time: number;
	is_logout_resting: number;
	rest_bonus: number;
	resttalents_cost: number;
	resttalents_time: number;
	trans_x?: number;
	trans_y?: number;
	trans_z?: number;
	trans_o?: number;
	transguid: number;
	extra_flags: number;
	stable_slots: number;
	at_login: number;
	zone?: number;
	death_expire_time: number;
	taxi_path: string;
	arenaPoints: number;
	totalHonorPoints: number;
	todayHonorPoints: number;
	yesterdayHonorPoints: number;
	totalKills: number;
	todayKills: number;
	yesterdayKills: number;
	chosenTitle: number;
	knownCurrencies: number;
	watchedFaction: number;
	drunk?: number;
	health: number;
	power1: number;
	power2: number;
	power3: number;
	power4: number;
	power5: number;
	power6: number; 
	power7: number;
	latency: number;
	talentGroupsCount: number;
	activeTalentGroup: number;
	exploredZones: string;
	equipmentCache: string;
	ammoId: number;
	knownTitles: string;
	actionBars: number;
	grantableLevels: number;
	order?: any | null; // Assuming order can be any type or null
	creation_date: string;
	deleteInfos_Account?: any | null;
	deleteInfos_Name?: any | null;
	deleteData?: string | null;
	innTriggerId: number;
	extraBonusTalentCount: number;

	// These are all known properties as of 2025-06-03

	[string: string]: any; // Allow additional properties
}