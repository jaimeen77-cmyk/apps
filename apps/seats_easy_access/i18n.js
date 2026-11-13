'use strict';

// Also translate composed status/error messages at the UI boundary.
const ENGLISH = {
    '시트 Easy Access': 'Seats Easy Access',
    '운전석': 'Driver', '조수석': 'Passenger',
    '상태를 확인하세요.': 'Refresh status first.',
    'Comfort 연결이 끊겼습니다.': 'Comfort disconnected.',
    '지원하지 않는 시트입니다.': 'Unsupported seat.',
    '시트 요청이 끝난 뒤 좌석을 변경하세요.': 'Wait for the seat request to finish before changing seats.',
    '운전석을 선택했습니다.': 'Driver seat selected.',
    '조수석을 선택했습니다.': 'Passenger seat selected.',
    'Comfort 상태를 먼저 확인하세요.': 'Refresh Comfort status first.',
    ' 조절 축을 찾지 못했습니다.': ' adjustment axes were not found.',
    '위치 센서가 없는 시트에서는 Easy Access를 저장할 수 없습니다.': 'Easy Access needs a seat with position sensors.',
    '앱 화면이 활성화되어 있어야 합니다.': 'Keep the app screen active.',
    '이전 요청을 처리하는 중입니다.': 'The previous request is still being processed.',
    '시트가 움직이는 중입니다. 먼저 정지하세요.': 'The seat is moving. Stop it first.',
    '정차 상태에서만 사용할 수 있습니다.': 'Only available when stationary.',
    '상태 확인 중…': 'Refreshing status…',
    'Easy Access 상태를 확인했습니다.': 'Easy Access status refreshed.',
    '상태 확인 실패: ': 'Status refresh failed: ',
    '요청 전송 중…': 'Sending request…',
    '요청 실패: ': 'Request failed: ',
    '상태 확인 후 앱 화면에서 변경하세요.': 'Refresh status and keep the app active before changing this setting.',
    'Easy Access 자동 작동을 켰습니다.': 'Automatic Easy Access enabled.',
    'Easy Access 자동 작동을 껐습니다.': 'Automatic Easy Access disabled.',
    ' 하차 위치를 저장했습니다.': ' exit position saved.',
    ' Easy Access 이동을 요청했습니다.': ' Easy Access movement requested.',
    '조수석 탭에서 사용하세요.': 'Select the passenger tab first.',
    '조수석 원위치 복귀를 요청했습니다.': 'Passenger return requested.',
    '조수석 공간 확보를 요청했습니다.': 'Passenger Make room movement requested.',
    '이 시트가 지원하지 않는 조절 축입니다.': 'This seat does not support that adjustment.',
    '시트 이동 중…': 'Moving seat…',
    '이동 실패: ': 'Movement failed: ',
    '짧은 이동을 완료했습니다.': 'Short movement completed.',
    '저장할 M1~M3 버튼을 누르세요.': 'Press M1, M2 or M3 to save.',
    '메모리 저장을 취소했습니다.': 'Memory save cancelled.',
    '에 저장했습니다.': ' saved.',
    ' 호출을 요청했습니다.': ' recall requested.',
    '정지를 요청했습니다. 실제로 멈췄는지 확인하세요.': 'Stop requested. Check that the seat has stopped.',
    '상태 없음': 'No status',
    'Comfort 연결됨': 'Comfort connected', 'Comfort 연결 끊김': 'Comfort disconnected',
    '차량 켜짐': 'car on', '차량 꺼짐': 'car off',
    '하차 위치로 이동 시작': 'moving to exit position', '운전 위치로 복귀 시작': 'moving back to driving position',
    '메모리 위치로 이동 시작': 'moving to memory', '공간 확보 이동 시작': 'Make room move', '시트 이동 끝': 'seat move ended',
    '복귀 대기 (하차 전 위치 기억)': 'waiting to move back (position before exit kept)', '복귀 완료': 'moved back',
    '자동 Easy Access 켜짐': 'automatic Easy Access on', '자동 Easy Access 꺼짐': 'automatic Easy Access off',
    'Comfort 로그': 'Comfort log', '상태 변화': 'status changes',
    '지원되는 시트 모듈 없음': 'No supported seat module',
    '하차 위치 저장됨': 'Exit position saved',
    '하차 위치 미저장': 'Exit position not saved',
    '켜짐': 'On', '꺼짐': 'Off', '확인 필요': 'Refresh required',
    '정차': 'Stationary', '주행 중': 'Driving', '시트 이동 중': 'Seat moving', '알 수 없음': 'Unknown',
    'Make room · 조수석 원위치 복귀': 'Make room · Return passenger seat',
    'Make room · 조수석 공간 확보': 'Make room · Move passenger seat forward',
    '선택 시트': 'Selected seat', '자동 Easy Access': 'Automatic Easy Access',
    '차량 상태': 'Vehicle status', '상태 새로 확인': 'Refresh status',
    '자동 Easy Access 켜기 / 끄기': 'Toggle automatic Easy Access',
    '높이 ▼': 'Height ▼', '높이 ▲': 'Height ▲',
    '등받이 ◀': 'Backrest ◀', '등받이 ▶': 'Backrest ▶',
    '쿠션 ▼': 'Cushion ▼', '쿠션 ▲': 'Cushion ▲',
    '헤드레스트 ▼': 'Headrest ▼', '헤드레스트 ▲': 'Headrest ▲',
    '메모리 저장': 'Save memory', '현재 위치를 하차 위치로 저장': 'Save current exit position',
    '하차 위치로 이동': 'Move to exit position', '시트 이동 정지': 'Stop seat movement',
    '저장과 시험은 정차 상태에서 하세요. 이동 경로를 비우고 순정 시트 스위치에 손이 닿게 하세요.':
        'Save and test while stationary. Keep the path clear and the physical seat switch within reach.',
};
// Korean for the M1 arrival check's log lines (0.6.7). Kept here, not in app.json's translations: those are part of
// the Store's prepared UI (store/runtime), which needs a full SDK build to regenerate.
const KOREAN = {
    'M1 power-on detected: waiting 6 seconds': 'M1 차량 켜짐 감지: 6초 대기',
    'M1 command sent: checking arrival': 'M1 명령 보냄: 도착 확인 중',
    'M1 arrived': 'M1 도착',
    'M1 short of target': 'M1 미도착',
    'M1 retry in 8 s': '8초 뒤 M1 재시도',
    'M1 still short after retry': 'M1 재시도 후에도 미도착',
    'M1 check: no memory job observed': 'M1 확인: 메모리 작업 감지 못함',
    'M1 retry: calling driver memory again': 'M1 재시도: 운전석 메모리 다시 호출',
    'M1 retry not needed: seat now at M1': 'M1 재시도 불필요: 이미 M1 위치',
    'M1 retry failed': 'M1 재시도 실패',
    'M1 retry cancelled: car not stationary': 'M1 재시도 취소: 정차 상태 아님',
    'M1 retry cancelled: option off': 'M1 재시도 취소: 옵션 꺼짐',
    'M1 retry cancelled: power or stationary condition changed': 'M1 재시도 취소: 전원 또는 정차 조건 변경',
    'M1 retry cancelled: Comfort stayed busy': 'M1 재시도 취소: Comfort 작업이 끝나지 않음',
    'M1 moved': 'M1 이동량',
    'M1 left to target': 'M1 목표까지 남은 거리',
    'App events + Comfort journal (C) by time': '앱 기록 + Comfort 로그(C) 시간순',
};
const koreanKeys = Object.keys(KOREAN).sort((a, b) => b.length - a.length);
const keys = Object.keys(ENGLISH).sort((a, b) => b.length - a.length);
function language() {
    try { return require('./kit/locale.json').language; }
    catch (_) { return 'en'; }
}
function translator(selectedLanguage) {
    const english = /^en(?:$|[-_])/i.test(selectedLanguage || language());
    return function translate(value) {
        let text = String(value);
        if (english) keys.forEach((key) => { text = text.split(key).join(ENGLISH[key]); });
        return text;
    };
}
/** The Korean edition's own log phrases, applied before the kit's word-by-word translation (which would turn
 * "M1 short of target" into a mix); the English edition keeps them as they are. */
function korean(selectedLanguage) {
    const english = /^en(?:$|[-_])/i.test(selectedLanguage || language());
    return function pre(value) {
        let text = String(value);
        if (!english) koreanKeys.forEach((key) => { text = text.split(key).join(KOREAN[key]); });
        return text;
    };
}
module.exports = { translator, korean, ENGLISH, KOREAN };
