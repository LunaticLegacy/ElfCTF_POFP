import json
import os
from pathlib import Path

from core.models import RuntimeConfig
from services.gzctf_service import GZCTFService


GAME_URL = 'https://gz.imxbt.cn/games/16/challenges#727-Ezre'
CHALLENGE_ID = '727'
TASK_NAME = 'Ezre'
#FLAG = 'ISCTF{7HI5_i5_R3AllY_3z_R3}'
FLAG = 'ISCTF{Wr0ng_f1A9}'
USER_ID = 'playground'
DATA_DIR = Path('.elfctf')


def build_runtime_config() -> RuntimeConfig:
    """Build the demo runtime config from environment variables."""
    username = str(os.environ.get('GZCTF_USERNAME', '')).strip()
    password = str(os.environ.get('GZCTF_PASSWORD', ''))
    if not username or not password:
        raise RuntimeError('请先设置环境变量 GZCTF_USERNAME 和 GZCTF_PASSWORD')
    return RuntimeConfig(
        gzctf_username=username,
        gzctf_password=password,
        gzctf_game_url=GAME_URL,
    )


def main() -> None:
    config = build_runtime_config()
    service = GZCTFService(DATA_DIR)
    base_url, game_id = service.parse_game_url(GAME_URL)

    print('[1/4] 登录并刷新共享 Cookie...')
    login_status = service.refresh_login(USER_ID, config)
    print(json.dumps(login_status, ensure_ascii=False, indent=2))

    print('[2/4] 获取当前队伍...')
    team_status = service.fetch_team_info(USER_ID, config)
    print(json.dumps(team_status, ensure_ascii=False, indent=2))

    print('[3/4] 打印题目摘要...')
    session = service.ensure_authenticated_session(USER_ID, config)
    game_details = service.fetch_game_details(session, base_url, game_id)
    challenge_summaries = [
        {
            'id': item.get('id'),
            'gameChallengeId': item.get('gameChallengeId'),
            'challengeId': item.get('challengeId'),
            'title': item.get('title'),
            'name': item.get('name'),
            'slug': item.get('slug'),
            'tag': item.get('tag'),
        }
        for item in service.list_challenge_candidates(game_details)
    ]
    print(json.dumps(challenge_summaries[:20], ensure_ascii=False, indent=2))

    print('[4/4] 手动提交 Flag...')
    submission = service.submit_flag_for_task(
        user_id=USER_ID,
        config=config,
        task_name=TASK_NAME,
        task_target=GAME_URL,
        gzctf_challenge_id=CHALLENGE_ID,
        flag=FLAG,
    )
    print(json.dumps(submission, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
