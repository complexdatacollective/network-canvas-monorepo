from pathlib import Path
import sys


generated_parent = Path(sys.argv[1])
base_url = sys.argv[2]
sys.path.insert(0, str(generated_parent))

from registry_client.api.default import list_entries  # noqa: E402
from registry_client.api.default import artifact  # noqa: E402
from registry_client.api.default import account  # noqa: E402
from registry_client.client import Client  # noqa: E402
from registry_client.models.list_entries_response_200_type_0 import (  # noqa: E402
    ListEntriesResponse200Type0,
)
from registry_client.models.list_entries_response_200_type_1 import (  # noqa: E402
    ListEntriesResponse200Type1,
)


with Client(base_url=f"{base_url}/api/v1", raise_on_unexpected_status=True) as client:
    response = list_entries.sync_detailed(
        client=client, limit=7, query='a/b?c#d&x=y+z'
    )

    assert response.status_code == 200
    assert isinstance(
        response.parsed, (ListEntriesResponse200Type0, ListEntriesResponse200Type1)
    )
    assert response.parsed.data == []
    assert response.parsed.next_cursor is None
    assert response.parsed.has_more is False
    artifact_response = artifact.sync_detailed(client=client, root='a' * 64)
    assert artifact_response.status_code == 200
    assert artifact_response.headers['content-type'] == (
        'application/vnd.networkcanvas.template+zip'
    )
    assert artifact_response.content == bytes([80, 75, 3, 4, 17, 34])
    account_response = account.sync_detailed(client=client)
    assert account_response.status_code == 200
    assert account_response.parsed is not None
    assert account_response.parsed.publisher is None
