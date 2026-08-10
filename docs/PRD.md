[app](file;file:///Users/iyeongho/Desktop/sellanding/rabbit-hole/carrot/app)  
해당 폴더 구조를 파악해서 browser 의 DOM을 감지하여 IntersectionObserver로 
각 컨텐츠 데이터를 감지 및 저장하는 기능을 만들어줘.

해당 가져오는 정보는 vector 형태로 로컬에 저장이 되어야해 
또한 기능흐름에 따라 텍스트 원문의 SHA-256 해시를 생성하여 같이 저장

SHA-256 PK 기반 조회	중	"crpto.subtle.digest('SHA-256', encoder.encode(text))로 빠른 해시 생성 후 
db.text_cache,get(hash) 조회를 실행하여 캐시 히트 판정
"

해당 작업 사항을 위해 구현이 필요한 것

IntersectionObserver로 화면 내 텍스트 스캔
스크롤 200ms 정지 시 연산 트리거	상	"무한 스크롤(SNS, 댓글 등)를 방지하기 위하여
childList, subtree 변화를 감지하여 신규 생성된 DOM에만 observer 추가" 

해당 vector store 데이터를 저장하는 DB는 구현이 안되었으므로 테스트를 위해 프로젝트 내 로컬 경로에 저장 
스크롤 할 때마다 해당 트리거를 작동하는게 아닌 스크롤 후 200ms 정지 시 해당 트리거 및 추후 연산 트리거를 실행 

작업 끝맡친후 테스트 하는 방법을 구체적으로 설명해줘 
